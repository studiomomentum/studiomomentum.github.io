import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';

export const root=path.join(os.homedir(),'Library/Application Support/MomentumConsult');
const source=path.dirname(fileURLToPath(import.meta.url));
export async function loadKnowledge(dir=path.join(source,'prompts')) {
  const business=await fs.readFile(path.join(dir,'business.md'),'utf8');
  const rules=await fs.readFile(path.join(dir,'rules.md'),'utf8');
  const entries=Object.fromEntries([...business.matchAll(/^## ([a-z_]+)\n([^#]*)/gm)].map(m=>[m[1],m[2].trim()]));
  if(!entries.scope||!entries.price_inbound||!entries.price_outbound||!rules.trim())throw Error('KNOWLEDGE_INVALID');
  return {entries,rules};
}
export function responseSchema(entries,channel) {
  const ids=Object.keys(entries).filter(id=>!id.startsWith('q_')&&id!==(channel==='OUTBOUND'?'price_inbound':'price_outbound'));
  return {type:'object',additionalProperties:false,required:['answers','question'],properties:{answers:{type:'array',minItems:1,maxItems:2,items:{type:'string',enum:ids}},question:{type:'string',enum:Object.keys(entries).filter(id=>id.startsWith('q_'))}}};
}
export function renderAnswer(value,entries,channel) {
  const schema=responseSchema(entries,channel);
  if(!value||Object.keys(value).sort().join(',')!=='answers,question'||!Array.isArray(value.answers)||value.answers.length<1||value.answers.length>2||value.answers.some(id=>!schema.properties.answers.items.enum.includes(id))||!schema.properties.question.enum.includes(value.question))throw Error('ANSWER_INVALID');
  return [...new Set(value.answers)].map(id=>entries[id]).concat(entries[value.question]||[]).filter(Boolean).join('\n\n');
}

export class ConsultCodex {
  constructor(options={}) {this.options=options;this.pending=new Map();this.seq=0;this.active=null;}
  async start() {
    const home=path.join(root,'codex-home'),cwd=path.join(root,'empty-workspace');
    await fs.mkdir(home,{recursive:true,mode:0o700});await fs.mkdir(cwd,{recursive:true,mode:0o700});
    // Isolate config, skills, history and plugins. Reuse only the explicitly authorized login.
    const auth=JSON.parse(await fs.readFile(path.join(os.homedir(),'.codex/auth.json'),'utf8'));
    if(!auth.tokens?.access_token)throw Error('CODEX_CHATGPT_LOGIN_REQUIRED');
    await fs.writeFile(path.join(home,'auth.json'),JSON.stringify({auth_mode:'chatgpt',tokens:auth.tokens,last_refresh:auth.last_refresh}),{mode:0o600});
    const flags=['shell_tool','unified_exec','apply_patch_freeform','apps','connectors','plugins','skill_search','multi_agent','collab','code_mode','js_repl','memories','memory_tool','web_search','view_image','image_generation','browser_use','computer_use','tool_search'];
    const args=['app-server','--listen','stdio://','-c','web_search="disabled"','-c','project_doc_max_bytes=0','-c','features.skip_host_skill_discovery=true',...flags.flatMap(k=>['-c',`features.${k}=false`])];
    this.cwd=cwd;
    this.child=spawn(this.options.binary||'/opt/homebrew/bin/codex',args,{cwd,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:home,CODEX_HOME:home,TMPDIR:process.env.TMPDIR||'/tmp'},stdio:['pipe','pipe','pipe']});
    this.child.stderr.resume(); // Never log model payloads, credentials or customer messages.
    readline.createInterface({input:this.child.stdout}).on('line',line=>{try{this.receive(JSON.parse(line));}catch{this.fail(Error('CODEX_PROTOCOL'));}});
    this.child.on('error',()=>this.fail(Error('CODEX_UNAVAILABLE')));
    this.child.on('exit',()=>{this.child=null;this.fail(Error('CODEX_EXIT'));});
    await this.request('initialize',{clientInfo:{name:'momentum_consult',title:'Momentum Consultation',version:'1.0.0'}});
    this.send({method:'initialized'});
    const account=await this.request('account/read',{});
    if(account.account?.type!=='chatgpt')throw Error('CODEX_CHATGPT_LOGIN_REQUIRED');
  }
  send(value){if(!this.child)throw Error('CODEX_UNAVAILABLE');this.child.stdin.write(JSON.stringify(value)+'\n');}
  request(method,params){return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CODEX_TIMEOUT'));},20000);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();if(this.active){this.active.reject(e);this.active=null;}}
  receive(m){
    if(m.id!==undefined&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('CODEX_REQUEST_FAILED')):p.resolve(m.result);return;}
    // No client-mediated tool, approval or command is executed.
    if(m.id!==undefined&&m.method){this.send({id:m.id,error:{code:-32601,message:'Tools disabled'}});return;}
    const a=this.active;if(!a||m.params?.threadId!==a.threadId)return;
    if(m.method==='item/started'&&!['userMessage','agentMessage','reasoning'].includes(m.params.item?.type)){this.request('turn/interrupt',{threadId:a.threadId,turnId:m.params.turnId}).catch(()=>{});a.reject(Error('TOOLS_FORBIDDEN'));this.active=null;return;}
    if(m.method==='item/completed'&&m.params.item?.type==='agentMessage')a.text=m.params.item.text;
    if(m.method==='turn/completed'){this.active=null;m.params.turn.status==='completed'?a.resolve(a.text):a.reject(Error('CODEX_TURN_FAILED'));}
  }
  async answer(job) {
    if(this.active)throw Error('CODEX_BUSY');
    const {entries,rules}=await loadKnowledge(this.options.promptDir);
    const schema=responseSchema(entries,job.channel);
    const allowed=Object.fromEntries(Object.entries(entries).filter(([id])=>id.startsWith('q_')||schema.properties.answers.items.enum.includes(id)));
    const t=await this.request('thread/start',{cwd:this.cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',baseInstructions:rules,developerInstructions:'다음 한국어 사업 안내만 답변 근거로 사용합니다.\n'+JSON.stringify(allowed),serviceName:'momentum_consult'});
    let timer;
    try {
      const result=new Promise((resolve,reject)=>{timer=setTimeout(()=>{this.active=null;this.stop();reject(Error('CODEX_TIMEOUT'));},60000);this.active={threadId:t.thread.id,resolve,reject,text:''};});
      // Attach rejection handler before awaiting turn/start to avoid unhandled exits.
      result.catch(()=>{});
      await this.request('turn/start',{threadId:t.thread.id,input:[{type:'text',text:JSON.stringify({history:job.messages}),text_elements:[]}],effort:'low',outputSchema:schema,sandboxPolicy:{type:'readOnly',networkAccess:false}});
      return renderAnswer(JSON.parse(await result),entries,job.channel);
    }finally{clearTimeout(timer);this.active=null;this.request('thread/unsubscribe',{threadId:t.thread.id}).catch(()=>{});}
  }
  stop(){if(this.child)this.child.kill('SIGTERM');}
}
