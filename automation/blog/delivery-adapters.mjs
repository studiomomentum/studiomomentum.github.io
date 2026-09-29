import {openEditor,inspectEditor,target} from './tistory-draft.mjs';
import {draftHTML,normalizedText} from './draft-format.mjs';
const threadsURL='https://www.threads.com';
async function waitCheck(fn){for(let n=0;n<30;n++){if(await fn())return;await new Promise(r=>setTimeout(r,500));}throw Error('RESULT_NOT_VERIFIED');}
async function tistoryRestore(context,source,accountName){
 const page=await openEditor(context,accountName);
 const count=Number((await page.getByRole('button',{name:/임시저장 개수/}).innerText()).trim());
 if(!Number.isFinite(count))throw Error('DRAFT_LIST_CHANGED');
 if(count){
  await page.getByRole('button',{name:/임시저장 개수/}).click();
  const dialog=page.getByRole('dialog');await waitCheck(async()=>await dialog.locator('.link_info').count()===count);
  const item=dialog.getByRole('link',{name:source.title,exact:true});
  if(await item.count()>1)throw Error('AMBIGUOUS_DRAFT');
  if(await item.count()===1){await item.click();await waitCheck(async()=>(await inspectEditor(page,source)).titleMatches);const check=await inspectEditor(page,source);if(!check.paragraphsMatch)throw Error('DRAFT_VERSION_CONFLICT');return {page,existing:true};}
  await dialog.getByRole('button',{name:'취소',exact:true}).click();
 }
 if((await page.locator('#post-title-inp').inputValue()).trim())throw Error('EDITOR_NOT_EMPTY');
 await page.locator('#post-title-inp').fill(source.title);
 await page.evaluate(html=>{const e=window.tinymce.get('editor-tistory');e.setContent(html);e.fire('change');e.save();},draftHTML(source.body));
 const check=await inspectEditor(page,source);if(!check.titleMatches||!check.paragraphsMatch)throw Error('EDITOR_CONTENT_MISMATCH');return {page,existing:false};
}
async function verifyTistoryURL(context,url,source){
 const page=await context.newPage();const response=await page.goto(url,{waitUntil:'domcontentloaded'});if(!response?.ok())throw Error('POST_NOT_VERIFIED');
 const text=normalizedText(await page.locator('body').innerText());if(!text.includes(normalizedText(source.title))||!source.body.split(/\n\s*\n/).every(p=>text.includes(normalizedText(p))))throw Error('POST_NOT_VERIFIED');return url;
}
async function tistory(context,job,control){
 const source=job.snapshot;
 if(control.receipt.clickStarted){if(job.kind==='publish'&&control.receipt.url)return {url:await verifyTistoryURL(context,control.receipt.url,source)};const restored=await tistoryRestore(context,source,control.accountName);if(!restored.existing)throw Error('RESULT_UNKNOWN');return {};}
 const {page,existing}=await tistoryRestore(context,source,control.accountName);
 if(job.kind==='draft'){
  if(!existing){await control.beforeClick({});await page.getByRole('button',{name:'임시저장',exact:true}).click();}
  const check=await tistoryRestore(context,source,control.accountName);if(!check.existing)throw Error('DRAFT_NOT_VERIFIED');return {};
 }
 await page.getByRole('button',{name:'완료',exact:true}).click();await page.getByLabel('공개',{exact:true}).check();
 // Unique deterministic path is reserved before the irreversible click.
 const slug='momentum-'+job.topicId+'-v'+job.version;
 const url=target+'/entry/'+slug;await page.locator('#urlPublish').fill(slug);
 await control.beforeClick({url});await page.getByRole('button',{name:'공개 발행',exact:true}).click();
 await page.waitForURL(u=>u.pathname.startsWith('/manage/posts')||u.href===url,{timeout:30000});
 return {url:await verifyTistoryURL(context,url,source)};
}
async function threadsComposer(context){
 const page=await context.newPage();await page.goto(threadsURL+'/',{waitUntil:'domcontentloaded'});
 await page.locator('a[href="/@sot_momentum"]').first().waitFor({timeout:15000});
 // The logged-in navigation profile must match the destination account.
  await page.getByText('새로운 소식을 공유해보세요.',{exact:true}).click();await page.getByRole('dialog').getByRole('textbox').waitFor();if(await page.getByRole('dialog').getByText('sot_momentum',{exact:true}).count()!==1)throw Error('WRONG_ACCOUNT');return page;
}
async function threadsRestore(context,source){
 const page=await threadsComposer(context);await page.getByRole('dialog').getByRole('button',{name:'임시 저장본',exact:true}).click();
 const row=page.getByRole('dialog').getByRole('button').filter({hasText:source.body.slice(0,25)});
 try{await row.first().waitFor({timeout:10000});}catch{await page.close();return null;}
 if(await row.count()!==1)throw Error('AMBIGUOUS_DRAFT');await row.click();await page.getByRole('dialog').getByRole('textbox').waitFor();
 if(normalizedText(await page.getByRole('dialog').getByRole('textbox').innerText())!==normalizedText(source.body))throw Error('DRAFT_VERSION_CONFLICT');return page;
}
async function threadsPostURL(context,source){
 const page=await context.newPage();await page.goto(threadsURL+'/@sot_momentum',{waitUntil:'domcontentloaded'});
 const text=page.getByText(source.body,{exact:true});await text.first().waitFor({timeout:20000});if(await text.count()!==1)throw Error('AMBIGUOUS_POST');
 const card=text.locator('xpath=ancestor::*[.//a[contains(@href,"/post/")]][1]');
 const href=await card.locator('a[href*="/@sot_momentum/post/"]').first().getAttribute('href');
 const url=new URL(href,threadsURL).href.split('?')[0];if(!/^https:\/\/www\.threads\.com\/@sot_momentum\/post\/[\w-]+$/.test(url))throw Error('POST_NOT_VERIFIED');return url;
}
async function threads(context,job,control){
 const source=job.snapshot;if(Array.from(source.body).length>500||/(https?:\/\/|www\.)/i.test(source.body))throw Error('THREADS_INVALID');
 if(control.receipt.clickStarted){if(job.kind==='publish')return {url:await threadsPostURL(context,source)};const restored=await threadsRestore(context,source);if(!restored)throw Error('RESULT_UNKNOWN');return {};}
 let page=await threadsRestore(context,source);const existing=!!page;
 if(!page){page=await threadsComposer(context);await page.getByRole('dialog').getByRole('textbox').fill(source.body);}
 if(normalizedText(await page.getByRole('dialog').getByRole('textbox').innerText())!==normalizedText(source.body))throw Error('EDITOR_CONTENT_MISMATCH');
 if(job.kind==='draft'){
  if(!existing){await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).waitFor();await control.beforeClick({});await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();}
  const saved=await threadsRestore(context,source);if(!saved)throw Error('DRAFT_NOT_VERIFIED');return {};
 }
 await control.beforeClick({});await page.getByRole('dialog').getByRole('button',{name:'게시',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden',timeout:30000});
 return {url:await threadsPostURL(context,source)};
}
export async function deliver(context,job,control){if(job.platform==='tistory')return tistory(context,job,control);if(job.platform==='threads')return threads(context,job,control);throw Error('PLATFORM_PAUSED');}
