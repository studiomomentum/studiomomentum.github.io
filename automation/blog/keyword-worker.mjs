import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {root} from './browser.mjs';import {refreshGroup} from './keyword-refresh.mjs';
const receiptFile=path.join(root,'keyword-receipt.json');
async function read(){try{return JSON.parse(await fs.readFile(receiptFile,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function write(data){await fs.writeFile(receiptFile+'.tmp',JSON.stringify(data),{mode:0o600});await fs.rename(receiptFile+'.tmp',receiptFile);}
export async function keywordOnce(config,rpc){
 let receipt=await read();if(!receipt){receipt={requestId:randomUUID()};await write(receipt);}
 if(!receipt.job){const {job}=await rpc(config,'content.keywords.claim',{requestId:receipt.requestId});if(!job){await fs.unlink(receiptFile);return;}receipt.job=job;receipt.results=[];await write(receipt);}
 for(const group of receipt.job.board.groups.filter(g=>g.id===receipt.job.source)){
  if(receipt.results.some(r=>r.id===group.id))continue;
  if(group.id==='vidiq'&&receipt.activeSource==='vidiq'){receipt.results.push({id:'vidiq',state:'failed',error:'VIDIQ_INTERRUPTED'});delete receipt.activeSource;await write(receipt);continue;}
  receipt.activeSource=group.id;await write(receipt);
  try{const result=await refreshGroup(group);receipt.results.push({id:group.id,state:'complete',group:result});}
  catch(e){receipt.results.push({id:group.id,state:'failed',error:/^[A-Z_]+$/.test(e.message)?e.message:(group.id==='vidiq'?'VIDIQ_PAGE_UNAVAILABLE':group.id==='naver'?'SEARCH_UNAVAILABLE':'TREND_UNAVAILABLE')});}
  delete receipt.activeSource;await write(receipt);console.log('키워드 '+group.id+' '+receipt.results.at(-1).state);
 }
 await rpc(config,'content.keywords.finish',{jobId:receipt.job.id,claim:receipt.job.claim,results:receipt.results});
 const dir=path.join(root,'keyword-history');await fs.mkdir(dir,{recursive:true,mode:0o700});await fs.rename(receiptFile,path.join(dir,receipt.job.id+'.json'));
}
