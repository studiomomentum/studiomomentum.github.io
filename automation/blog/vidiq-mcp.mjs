import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {auth} from '@modelcontextprotocol/sdk/client/auth.js';
import {root,openBrowser} from './browser.mjs';
const endpoint=new URL('https://mcp.vidiq.com/mcp');
const file=path.join(root,'vidiq-mcp-auth.json');
const redirect='http://127.0.0.1:43829/callback';
export async function connectVidiq({onAuthorize}={}){
 let data={};try{data=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!onAuthorize&&!data.tokens)throw Error('VIDIQ_MCP_LOGIN_REQUIRED');
 const save=async()=>{await fs.mkdir(root,{recursive:true,mode:0o700});await fs.writeFile(file+'.tmp',JSON.stringify(data),{mode:0o600});await fs.rename(file+'.tmp',file);};
 const state=randomBytes(24).toString('hex');
 const provider={redirectUrl:redirect,clientMetadata:{client_name:'Momentum Weekly Keyword Research',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},state:()=>state,
 clientInformation:()=>data.client,saveClientInformation:async v=>{data.client=v;await save();},tokens:()=>data.tokens,saveTokens:async v=>{data.tokens=v;await save();},
 saveCodeVerifier:async v=>{data.verifier=v;await save();},codeVerifier:()=>data.verifier,
 redirectToAuthorization:async url=>{if(!onAuthorize)throw Error('VIDIQ_MCP_LOGIN_REQUIRED');await onAuthorize(url,state);},
 invalidateCredentials:async scope=>{if(scope==='all')data={};else if(scope==='client')delete data.client;else if(scope==='tokens')delete data.tokens;else if(scope==='verifier')delete data.verifier;await save();}};
 async function authorize(code){const result=await auth(provider,{serverUrl:endpoint,authorizationCode:code});if(result!=='AUTHORIZED')return false;return true;}
 let id=0,sessionId;
 async function request(method,params){
  const requestId=++id;
  const send=()=>fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+data.tokens.access_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26',...(sessionId?{'Mcp-Session-Id':sessionId}:{})},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(45000)});
  let response=await send();
  // A rejected authorization has not executed the request; never retry a network failure.
  if(response.status===401){await response.body?.cancel();if(!await authorize())throw Error('VIDIQ_MCP_LOGIN_REQUIRED');response=await send();}
  if(!response.ok){await response.body?.cancel();throw Error(response.status===401?'VIDIQ_MCP_LOGIN_REQUIRED':'VIDIQ_MCP_QUERY_FAILED');}
  if(response.headers.get('mcp-session-id'))sessionId=response.headers.get('mcp-session-id');
  if(response.headers.get('content-type')?.includes('application/json')){const message=await response.json();if(message.error)throw Error('VIDIQ_MCP_QUERY_FAILED');return message.result;}
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const payload=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!payload)continue;const message=JSON.parse(payload);if(message.id!==requestId)continue;if(message.error)throw Error('VIDIQ_MCP_QUERY_FAILED');return message.result;}if(done)break;if(buffer.length>5_000_000)throw Error('VIDIQ_MCP_QUERY_FAILED');}}finally{await reader.cancel().catch(()=>{});}
  throw Error('VIDIQ_MCP_QUERY_FAILED');
 }
 const client={listTools:()=>request('tools/list',{}),callTool:({name,arguments:args})=>{if(!['vidiq_balance','vidiq_keyword_research'].includes(name))throw Error('VIDIQ_TOOL_NOT_ALLOWED');return request('tools/call',{name,arguments:args});},close:async()=>{}};
 if(!data.tokens){if(!await authorize())return {finish:async code=>{if(!await authorize(code))throw Error('VIDIQ_MCP_LOGIN_REQUIRED');return client;}};}
 await request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'momentum-keywords',version:'1.0.0'}});
 return client;
}
export function unpack(result){if(result.isError)throw Error('VIDIQ_MCP_QUERY_FAILED');if(result.structuredContent)return result.structuredContent;const text=result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');try{return JSON.parse(text);}catch{throw Error('VIDIQ_METRICS_UNAVAILABLE');}}
async function setup(){
 let expected,resolveCode,rejectCode,context;
 const code=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});code.catch(()=>{});
 const server=http.createServer((req,res)=>{const url=new URL(req.url,redirect);if(url.pathname!=='/callback'||url.searchParams.get('state')!==expected){res.writeHead(400);res.end('Invalid callback');return;}if(!url.searchParams.get('code')){res.end('Authorization failed');rejectCode(Error('VIDIQ_MCP_LOGIN_REQUIRED'));return;}res.end('Momentum vidIQ connection authorized. You may close this window.');resolveCode(url.searchParams.get('code'));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(43829,'127.0.0.1',resolve);});
 const timer=setTimeout(()=>rejectCode(Error('VIDIQ_MCP_LOGIN_REQUIRED')),10*60*1000);
 try{let client=await connectVidiq({onAuthorize:async(url,state)=>{expected=state;context=await openBrowser('vidiq','setup');await (context.pages()[0]||await context.newPage()).goto(url.href);console.log('vidIQ 공식 연결 승인 화면을 열었습니다.');}});if(client.finish)client=await client.finish(await code);try{const {tools}=await client.listTools();console.log(JSON.stringify({connected:true,tools:tools.filter(t=>/balance|keyword_research/.test(t.name)).map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema}))}));}finally{await client.close();}}finally{clearTimeout(timer);server.close();if(context)await context.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))setup().catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'VIDIQ_MCP_SETUP_FAILED');process.exitCode=1;});
