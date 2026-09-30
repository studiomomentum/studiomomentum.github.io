// Uses the existing dedicated Chrome session; never stores credentials.
export const naverBlogId='sot_momentum';
export const naverTarget='https://blog.naver.com/'+naverBlogId;
const lines=s=>s.replace(/\r\n?/g,'\n').split('\n');
export function sameNaverLines(actual,body){return JSON.stringify(actual)===JSON.stringify(lines(body));}
export function naverPostURL(url){return /^https:\/\/blog\.naver\.com\/sot_momentum\/\d+$/.test(url);}
async function until(fn){for(let n=0;n<40;n++){if(await fn())return;await new Promise(r=>setTimeout(r,250));}throw Error('RESULT_NOT_VERIFIED');}
export async function inspectNaver(page,source){
 const title=(await page.locator('.se-documentTitle .__se-node').allTextContents()).join('');
 const body=await page.locator('.se-component.se-text .se-text-paragraph').evaluateAll(es=>es.map(e=>[...e.querySelectorAll('.__se-node')].map(n=>n.textContent).join('')));
 return {titleMatches:title===source.title,linesMatch:sameNaverLines(body,source.body),lineCount:body.length};
}
async function editor(context){
 const account=await context.newPage();await account.goto('https://blog.naver.com/MyBlog.naver',{waitUntil:'domcontentloaded'});
 if(new URL(account.url()).pathname!=='/'+naverBlogId)throw Error('WRONG_ACCOUNT');await account.close();
 const page=await context.newPage();await page.goto(naverTarget+'/postwrite',{waitUntil:'domcontentloaded'});
 await page.locator('.se-documentTitle').waitFor({timeout:15000});return page;
}
async function restore(context,source,required=false){
 const page=await editor(context),countButton=page.getByRole('button',{name:/임시저장된 글 보기/});await countButton.waitFor();
 // The initial toolbar count can briefly be zero before account options load.
 const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/TempPostList.naver',{timeout:15000});
 await countButton.click();const payload=await (await loaded).json();
 const count=payload?.result?.totalCount;
 if(!payload.isSuccess||!Number.isInteger(count)||payload.result.tempPostList?.length!==count)throw Error('DRAFT_LIST_CHANGED');
 if(count){
  const rows=page.locator('button[data-click-area="tpb*s.tlist"]');
  await until(async()=>await rows.count()===count);
  const matches=rows.filter({has:page.getByText(source.title,{exact:true})});
  if(await matches.count()>1)throw Error('AMBIGUOUS_DRAFT');
  if(await matches.count()===1){
   await matches.click();await until(async()=>(await inspectNaver(page,source)).titleMatches);
   const check=await inspectNaver(page,source);if(!check.linesMatch)throw Error('DRAFT_VERSION_CONFLICT');
   return {page,existing:true,...check};
  }
 }
 await page.getByRole('button',{name:'팝업닫기',exact:true}).click();
 if(required)throw Error('RESULT_UNKNOWN');
 if((await page.locator('.se-documentTitle .__se-node,.se-component.se-text .__se-node').allTextContents()).join('').trim())throw Error('EDITOR_NOT_EMPTY');
 await page.locator('.se-documentTitle .se-text-paragraph').click();await page.keyboard.insertText(source.title);
 await page.locator('.se-component.se-text .se-text-paragraph').first().click();
 for(const [i,line] of lines(source.body).entries()){if(i)await page.keyboard.press('Enter');if(line)await page.keyboard.insertText(line);}
 const check=await inspectNaver(page,source);if(!check.titleMatches||!check.linesMatch)throw Error('EDITOR_CONTENT_MISMATCH');
 return {page,existing:false,...check};
}
async function verifyPost(context,url,source){
 if(!naverPostURL(url))throw Error('POST_URL_INVALID');
 const page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});
 await until(async()=>{
  for(const frame of page.frames()){
   const title=await frame.locator('.se-title-text').allTextContents();
   const paragraphs=await frame.locator('.se-main-container .se-text-paragraph').allTextContents();
   if(title.join('').trim()===source.title&&sameNaverLines(paragraphs.map(s=>s.replace(/\u200b/g,'')),source.body))return true;
  }return false;
 });return {url};
}
async function recoverPost(context,source){
 const page=await context.newPage();await page.goto(naverTarget,{waitUntil:'domcontentloaded'});
 const urls=new Set();
 await until(async()=>{
  for(const frame of page.frames()){
   const links=await frame.getByText(source.title,{exact:true}).evaluateAll(es=>es.map(e=>e.closest('a')?.href).filter(Boolean));
   for(const link of links){const u=new URL(link);const id=u.searchParams.get('blogId'),no=u.searchParams.get('logNo');const canonical=id===naverBlogId&&/^\d+$/.test(no||'')?naverTarget+'/'+no:link.split('?')[0];if(naverPostURL(canonical))urls.add(canonical);}
  }return urls.size>0;
 });if(urls.size!==1)throw Error('AMBIGUOUS_POST');return verifyPost(context,[...urls][0],source);
}
export async function naverDelivery(context,job,control){
 if(!['draft','publish'].includes(job.kind))throw Error('DELIVERY_KIND_INVALID');
 if(job.target!==naverBlogId)throw Error('WRONG_BLOG');
 if(control.receipt.clickStarted&&job.kind==='publish')return recoverPost(context,job.snapshot);
 const {page,existing}=await restore(context,job.snapshot,!!control.receipt.clickStarted);
 if(job.kind==='draft'){
  if(!existing){await control.beforeClick({});await page.getByRole('button',{name:'저장',exact:true}).click();await until(async()=>Number((await page.getByRole('button',{name:/임시저장된 글 보기/}).innerText()).trim())>0);}
  await page.close();const result=await restore(context,job.snapshot,true);await result.page.close();return {};
 }
 await page.getByRole('button',{name:'발행',exact:true}).click();await page.getByTestId('seOnePublishBtn').waitFor();
 await page.locator('label[for="open_public"]').click();if(!await page.getByTestId('openType_2').isChecked())throw Error('VISIBILITY_NOT_PUBLIC');
 await control.beforeClick({});await page.getByTestId('seOnePublishBtn').click();
 await page.waitForURL(u=>naverPostURL(u.href),{timeout:30000});return verifyPost(context,page.url(),job.snapshot);
}
