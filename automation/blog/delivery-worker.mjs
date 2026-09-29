import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {openBrowser,root} from './browser.mjs';import {deliver} from './delivery-adapters.mjs';
const receiptFile=path.join(root,'delivery-receipt.json');
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function write(data){await fs.mkdir(root,{recursive:true,mode:0o700});const tmp=receiptFile+'.tmp';await fs.writeFile(tmp,JSON.stringify(data),{mode:0o600});await fs.rename(tmp,receiptFile);}
export async function deliveryOnce(config,rpc){
 let receipt=await read(receiptFile);
 if(!receipt){receipt={requestId:randomUUID()};await write(receipt);}
 if(!receipt.job){const result=await rpc(config,'content.delivery.claim',{requestId:receipt.requestId});if(!result.job){await fs.unlink(receiptFile);return;}receipt.job=result.job;await write(receipt);}
 const job=receipt.job;
 if(!receipt.outcome){
  let context;
  try{
   const settings=await read(path.join(root,'browser-settings.json'));if(!settings?.profile)throw Error('BROWSER_SETUP_REQUIRED');
   await rpc(config,'content.delivery.authorize',{jobId:job.id,claim:job.claim});
   context=await openBrowser(settings.profile,'operate');
   const result=await deliver(context,job,{accountName:settings.accountName,receipt,beforeClick:async meta=>{
    await rpc(config,'content.delivery.authorize',{jobId:job.id,claim:job.claim});Object.assign(receipt,meta,{clickStarted:true});await write(receipt);
   }});
   receipt.outcome={state:'complete',...result};
  }catch(e){receipt.outcome={state:receipt.clickStarted?'unknown':'failed',error:/^[A-Z_]+$/.test(e.message)?e.message:'BROWSER_LOGIN_OR_EDITOR_CHECK_REQUIRED'};}
  finally{if(context)await context.close().catch(()=>{});}
  await write(receipt);
 }
 await rpc(config,'content.delivery.finish',{jobId:job.id,claim:job.claim,...receipt.outcome});
 // Receipts contain the exact dispatched version; keep private recovery history.
 const history=path.join(root,'delivery-history');await fs.mkdir(history,{recursive:true,mode:0o700});await fs.rename(receiptFile,path.join(history,job.id+'.json'));
 console.log(job.platform+' '+job.kind+' '+receipt.outcome.state);
}
