import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from './browser.mjs';
import {draftHTML,paragraphs,normalizedText,fingerprint} from './draft-format.mjs';
export const target='https://sotmomentum.tistory.com';
export const receiptPath=path.join(root,'tistory-draft-receipt.json');
export async function saveReceipt(value){await fs.mkdir(root,{recursive:true,mode:0o700});const temp=receiptPath+'.tmp';await fs.writeFile(temp,JSON.stringify(value),{mode:0o600});await fs.rename(temp,receiptPath);}
export async function sourceDraft(topicId){
 const config=JSON.parse(await fs.readFile(path.join(root,'worker-session.json'),'utf8'));
 const url=new URL(config.url);if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname))throw Error('RELAY_URL_INVALID');
 const response=await fetch(url,{method:'POST',body:JSON.stringify({route:'momentum_admin',action:'content.get',session:config.session}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!result.ok)throw Error(result.error||'RELAY_FAILED');
 const doc=result.result.articles[topicId+':tistory'];if(!doc)throw Error('DRAFT_NOT_FOUND');
 const last=doc.versions.at(-1);return {id:doc.id,version:doc.versions.length,title:last.title,body:last.body};
}
export async function inspectEditor(page,draft){
 if(new URL(page.url()).origin!==target)throw Error('WRONG_BLOG');
 const title=await page.locator('#post-title-inp').inputValue();
 const blocks=await page.frameLocator('#editor-tistory_ifr').locator('body > p').allInnerTexts();
 return {titleMatches:title===draft.title,paragraphsMatch:JSON.stringify(blocks.map(normalizedText))===JSON.stringify(paragraphs(draft.body).map(normalizedText)),paragraphs:blocks.length};
}
export async function fillAndSave(page,draft){
 if(new URL(page.url()).origin!==target||!new URL(page.url()).pathname.startsWith('/manage/newpost'))throw Error('WRONG_BLOG');
 try{await fs.access(receiptPath);throw Error('RECEIPT_REVIEW_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}
 await page.locator('#post-title-inp').waitFor();
 const body=page.frameLocator('#editor-tistory_ifr').locator('body');
 if((await page.locator('#post-title-inp').inputValue()).trim()||(await body.innerText()).trim())throw Error('EDITOR_NOT_EMPTY');
 const receipt={state:'prepared',source:draft,fingerprint:fingerprint(draft),target,createdAt:Date.now()};await saveReceipt(receipt);
 await page.locator('#post-title-inp').fill(draft.title);
 await page.evaluate(html=>{const editor=window.tinymce?.get('editor-tistory');if(!editor)throw Error('EDITOR_NOT_FOUND');editor.setContent(html);editor.fire('change');editor.save();},draftHTML(draft.body));
 const check=await inspectEditor(page,draft);if(!check.titleMatches||!check.paragraphsMatch)throw Error('EDITOR_CONTENT_MISMATCH');
 receipt.state='save_requested';await saveReceipt(receipt);
 await page.getByRole('button',{name:'임시저장',exact:true}).click();
 return {...check,state:'save_requested'};
}
export async function openEditor(context,accountName){
 const page=await context.newPage();await page.goto(target+'/manage/newpost/',{waitUntil:'domcontentloaded'});
 if(new URL(page.url()).pathname.startsWith('/auth/login')){
  await page.getByText('카카오계정으로 로그인',{exact:true}).click();
  await page.waitForURL(url=>url.hostname==='accounts.kakao.com'||url.origin===target,{timeout:15000});
  if(new URL(page.url()).hostname==='accounts.kakao.com'){
   if(!accountName)throw Error('LOGIN_REQUIRED');
   const account=page.getByRole('button').filter({hasText:accountName});
   await account.first().waitFor({timeout:15000});if(await account.count()!==1)throw Error('ACCOUNT_SELECTION_REQUIRED');
   await account.click();await page.waitForURL(target+'/manage/newpost/',{timeout:15000});
  }
 }
 if(new URL(page.url()).origin!==target)throw Error('LOGIN_REQUIRED');
 await page.locator('#post-title-inp').waitFor({timeout:15000});return page;
}
export async function verifySaved(context,draft,accountName){
 const page=await openEditor(context,accountName);
 await page.getByRole('button',{name:/임시저장 개수/}).click();
 const item=page.getByText(draft.title,{exact:true});await item.waitFor({timeout:15000});if(await item.count()!==1)throw Error('AMBIGUOUS_DRAFT');
 await item.click();
 await page.waitForFunction(title=>document.querySelector('#post-title-inp')?.value===title,draft.title,{timeout:15000});
 await page.waitForFunction(()=>window.tinymce?.get('editor-tistory')?.getContent({format:'text'}).trim().length>0,null,{timeout:15000});
 const check=await inspectEditor(page,draft);if(!check.titleMatches||!check.paragraphsMatch)throw Error('SAVED_CONTENT_MISMATCH');
 const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
 if(receipt.fingerprint!==fingerprint(draft))throw Error('RECEIPT_MISMATCH');
 await saveReceipt({...receipt,state:'verified',verifiedAt:Date.now(),verification:check});return check;
}
