// Private draft only. No public publishing action is implemented here.
import fs from 'node:fs/promises';
import {openBrowser} from './browser.mjs';
import {fingerprint} from './draft-format.mjs';
import {sourceDraft,openEditor,fillAndSave,verifySaved,receiptPath} from './tistory-draft.mjs';
const [topicId,profile='tistory',accountName]=process.argv.slice(2);let context;
try{
 if(!/^[\w-]+$/.test(topicId||''))throw Error('TOPIC_ID_REQUIRED');
 const source=await sourceDraft(topicId);
 let receipt;try{receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(receipt&&receipt.fingerprint!==fingerprint(source))throw Error('RECEIPT_REVIEW_REQUIRED');
 context=await openBrowser(profile,'operate');
 if(!receipt){const page=await openEditor(context,accountName);await fillAndSave(page,source);}
 // Existing/ambiguous receipts are read back, never blindly clicked again.
 const result=await verifySaved(context,source,accountName);
 console.log(JSON.stringify({platform:'tistory',state:'draft_verified',sourceVersion:source.version,...result,published:false}));
}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'DRAFT_CHECK_REQUIRED');process.exitCode=1;}
finally{if(context)await context.close();}
