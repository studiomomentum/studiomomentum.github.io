import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ConsultCodex,root} from './app-server.mjs';
const configPath=path.join(root,'worker.json'),receiptPath=path.join(root,'receipt.json');
async function read(p){try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function write(p,value){await fs.writeFile(p+'.tmp',JSON.stringify(value),{mode:0o600});await fs.rename(p+'.tmp',p);}
export async function rpc(config,action,payload={}){
  const u=new URL(config.url);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname))throw Error('RELAY_INVALID');
  const response=await fetch(u,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({route:'momentum_consult_worker',workerToken:config.workerToken,action,...payload}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Error('RELAY_CONNECTION');const body=await response.json();if(!body.ok)throw Error(body.error||'RELAY_FAILED');return body.result;
}
let engine=null,config=null,stopping=false;
const lockPath=path.join(root,'worker.lock');let ownsLock=false;
async function lock(){
  await fs.mkdir(root,{recursive:true,mode:0o700});
  try{await fs.mkdir(lockPath,{mode:0o700});}catch(e){
    if(e.code!=='EEXIST')throw e;
    const pid=Number(await fs.readFile(path.join(lockPath,'pid'),'utf8').catch(()=>''));if(!pid)throw Error('WORKER_LOCK_CHECK_REQUIRED');
    try{process.kill(pid,0);throw Error('WORKER_ALREADY_RUNNING');}catch(error){if(error.code!=='ESRCH')throw error;}
    await fs.rm(lockPath,{recursive:true});await fs.mkdir(lockPath,{mode:0o700});
  }
  ownsLock=true;await fs.writeFile(path.join(lockPath,'pid'),String(process.pid),{mode:0o600});
}
async function unlock(){if(ownsLock){await fs.rm(lockPath,{recursive:true,force:true});ownsLock=false;}}
async function tick(){
  config=await read(configPath);if(!config)throw Error('WORKER_NOT_CONFIGURED');
  let receipt=await read(receiptPath);
  if(receipt){
    receipt.answer ||= '답변 준비 중 연결이 끊겼어요. PD와 직접 상담하실 수 있습니다';
    await rpc(config,'complete',receipt);await fs.unlink(receiptPath);
  }
  if(!engine?.child){engine=new ConsultCodex();await engine.start();}
  const {job}=await rpc(config,'claim');if(!job)return;
  receipt={id:job.id,requestId:job.requestId,claim:job.claim};await write(receiptPath,receipt);
  try{receipt.answer=await engine.answer(job);}catch{receipt.answer='지금은 AI 답변을 준비하기 어려워요. 아래 버튼으로 PD와 직접 상담하실 수 있습니다';engine.stop();}
  await write(receiptPath,receipt);await rpc(config,'complete',receipt);await fs.unlink(receiptPath);
  console.log(new Date().toISOString()+' 상담 요청 처리 완료');
}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stopping=true;engine?.stop();Promise.allSettled([unlock(),config?rpc(config,'offline'):Promise.resolve()]).finally(()=>process.exit(0));});
if(process.argv[1]===fileURLToPath(import.meta.url)){
  await lock();
  do{try{await tick();}catch(e){console.error(new Date().toISOString()+' 상담 실행기: '+(/^[A-Z_]+$/.test(e.message)?e.message:'LOCAL_ERROR'));engine?.stop();if(config)await rpc(config,'offline').catch(()=>{});}
    if(process.argv[2]!=='once'&&!stopping)await new Promise(r=>setTimeout(r,6000));
  }while(process.argv[2]!=='once'&&!stopping);
  engine?.stop();
  await unlock();
}
