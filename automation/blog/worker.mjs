import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import {Writable} from 'node:stream';
import {root} from './browser.mjs';
import {generate} from './generator.mjs';
const configFile=path.join(root,'worker-session.json'), receiptFile=path.join(root,'generation-receipt.json');
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function write(file,data){await fs.mkdir(root,{recursive:true,mode:0o700});const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(data),{mode:0o600});await fs.rename(temp,file);}
async function rpc(config,action,payload={}){
  const url=new URL(config.url);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))throw Error('RELAY_URL_INVALID');
  const response=await fetch(url,{method:'POST',body:JSON.stringify({route:'momentum_admin',action,session:config.session,...payload}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('RELAY_CONNECTION');const data=await response.json();if(!data.ok)throw Error(data.error||'RELAY_FAILED');return data.result;
}
async function question(label,secret=false){
  process.stdout.write(label);const output=new Writable({write(chunk,encoding,cb){if(!secret)process.stdout.write(chunk);cb();}});
  const rl=readline.createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
  const value=await new Promise(resolve=>rl.question('',resolve));rl.close();if(secret)process.stdout.write('\n');return value;
}
async function once(config){
  let receipt=await read(receiptFile);
  if(receipt){
    // Recover a lost completion response without generating or posting again.
    if(receipt.outputs){await rpc(config,'content.worker.complete',receipt);await fs.unlink(receiptFile);return;}
    if(receipt.jobId){await rpc(config,'content.worker.fail',receipt);await fs.unlink(receiptFile);console.log('중단된 생성 작업을 실패로 기록했습니다.');return;}
    if(!receipt.requestId)throw Error('RECEIPT_INVALID');
  }
  if(!receipt){receipt={requestId:randomUUID()};await write(receiptFile,receipt);}
  const result=await rpc(config,'content.worker.claim',{requestId:receipt.requestId});if(!result.job){await fs.unlink(receiptFile);console.log(result.activeJobId?'진행 중 작업 확인 필요':'생성 대기 없음');return;}
  const job=result.job;receipt={jobId:job.id,claim:job.claim};await write(receiptFile,receipt);
  let outputs;
  try{outputs=await generate(job.topic);}catch(e){await rpc(config,'content.worker.fail',receipt);await fs.unlink(receiptFile);throw e;}
  receipt.outputs=outputs;await write(receiptFile,receipt);
  await rpc(config,'content.worker.complete',receipt);await fs.unlink(receiptFile);console.log('세 매체 초안 저장 완료 · 발행 없음');
}
try{
  const command=process.argv[2]||'once';
  if(command==='login'){
    const url=await question('기존 Apps Script 웹앱 URL: '),password=await question('관리자 비밀번호 (화면에 표시되지 않음): ',true);
    const session=await rpc({url},'login',{username:'admin',password,remember:true});
    await write(configFile,{url,session:session.token,expiresAt:session.expiresAt});console.log('관리자 세션을 로컬 전용 파일에 저장했습니다.');
  }else if(['once','run'].includes(command)){
    const config=await read(configFile);if(!config||config.expiresAt<=Date.now())throw Error('LOGIN_REQUIRED');
    do{await once(config);if(command==='run')await new Promise(r=>setTimeout(r,15000));}while(command==='run');
  }else throw Error('COMMAND_INVALID');
}catch(e){console.error('실행 중단: '+(/^[A-Z_]+$/.test(e.message)?e.message:'LOCAL_ERROR')+' · 재로그인 또는 작업 상태를 확인하세요.');process.exitCode=1;}
