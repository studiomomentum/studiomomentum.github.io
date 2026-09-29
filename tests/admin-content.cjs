const {chromium}=require('../automation/blog/node_modules/playwright');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
let raw,props={};const file={getId:()=> 'fixture',getBlob:()=>({getDataAsString:()=>raw}),setContent:s=>raw=s};
const sandbox={Date,JSON,Utilities:{getUuid:()=>crypto.randomUUID()},DriveApp:{createFile:(name,s)=>{raw=s;return file},getFileById:()=>file},adminProps_:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v}),adminLock_:fn=>fn()};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('server/apps-script/ContentStore.gs','utf8'),sandbox);
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url()),file=path.join(process.cwd(),u.pathname);if(u.hostname==='momentum.local'&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});return r.fulfill({body:'[]',contentType:'application/json'});});
 await page.exposeFunction('contentTestCall',(action,payload)=>{try{return {ok:true,result:JSON.parse(JSON.stringify(sandbox.contentRoute_({action,...payload})))}}catch(e){return {ok:false,error:e.message}}});
 await page.goto('http://momentum.local/admin.html');
 await page.evaluate(async()=>{MomentumAdmin.call=async(action,payload)=>{const r=await window.contentTestCall(action,payload);if(!r.ok){const e=Error(r.error);e.code=r.error;throw e;}return r.result};document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';setMainTab('CONTENT');});
 await page.getByText('기획서 기반 추천 주제 · 검색 근거 미검증',{exact:true}).click();
 await page.getByRole('button',{name:'촬영 전에 대본에서 먼저 정할 세 가지',exact:true}).click();
 await page.getByRole('button',{name:'세 매체 초안 생성',exact:true}).click();
 await page.getByText('생성 요청을 접수했습니다.',{exact:true}).waitFor();
 const job=sandbox.contentRoute_({action:'content.worker.claim',requestId:crypto.randomUUID()}).job;
 await page.evaluate(()=>window.generationEditorBefore=document.getElementById('contentEditor').firstChild);
 await page.waitForFunction(()=>document.querySelector('#contentGenerationProgress progress').value===50);
 assert(await page.evaluate(()=>window.generationEditorBefore===document.getElementById('contentEditor').firstChild));
 for(const width of [320,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}

 sandbox.contentRoute_({action:'content.worker.complete',jobId:job.id,claim:job.claim,outputs:Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:p+' 제목',body:'실제 글 생성이 아닌 화면 검증 fixture.\nhttps://studiomomentum.github.io/'}]))});
 // Generation completion must appear through polling, without a manual reload.
 await page.getByLabel('네이버 본문',{exact:true}).waitFor({timeout:20000});assert.equal(await page.locator('.content-draft').count(),3);
 assert.equal(await page.locator('#contentGenerationProgress progress').evaluate(el=>el.value),100);
 const beforeSingle=sandbox.contentRoute_({action:'content.get'});
 const unchangedNaver=JSON.stringify(beforeSingle.articles[job.topic.id+':naver']);
 const unchangedThreads=JSON.stringify(beforeSingle.articles[job.topic.id+':threads']);
 await page.getByRole('button',{name:'티스토리만 새 버전 생성',exact:true}).click();
 const single=sandbox.contentRoute_({action:'content.worker.claim',requestId:crypto.randomUUID()}).job;
 assert.deepEqual(Array.from(single.platforms),['tistory']);
 sandbox.contentRoute_({action:'content.worker.complete',jobId:single.id,claim:single.claim,outputs:{tistory:{title:'티스토리 새 제목',body:'티스토리만 새 본문'}}});
 await page.waitForFunction(()=>document.querySelector('[aria-label="티스토리 본문"]').value==='티스토리만 새 본문');
 const afterSingle=sandbox.contentRoute_({action:'content.get'});
 assert.equal(JSON.stringify(afterSingle.articles[job.topic.id+':naver']),unchangedNaver);
 assert.equal(JSON.stringify(afterSingle.articles[job.topic.id+':threads']),unchangedThreads);
 await page.getByLabel('네이버 본문',{exact:true}).fill('저장되지 않은 네이버 수정');
 await page.getByLabel('티스토리 본문',{exact:true}).fill('다른 매체 수정 보존');
 await page.evaluate(()=>renderTable());assert.equal(await page.getByLabel('네이버 본문',{exact:true}).inputValue(),'저장되지 않은 네이버 수정');
 const naver=page.locator('.content-draft').filter({has:page.getByRole('heading',{name:'네이버',exact:true})});
 await naver.getByRole('button',{name:'저장',exact:true}).click();
 await page.getByText('새 버전을 저장했습니다. 수정한 글의 검수 상태를 해제했습니다.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('티스토리 본문',{exact:true}).inputValue(),'다른 매체 수정 보존');
 const tistory=page.locator('.content-draft').filter({has:page.getByRole('heading',{name:'티스토리',exact:true})});
 await tistory.getByRole('button',{name:'저장',exact:true}).click();
 await naver.getByRole('button',{name:'검수 완료',exact:true}).click();
 await naver.getByText('검수 완료 · v2',{exact:true}).waitFor();
 await page.getByLabel('네이버 본문',{exact:true}).fill('<img src=x onerror=alert(1)> 수정');
 assert(await naver.getByRole('button',{name:'검수 완료',exact:true}).isDisabled());
 await naver.getByRole('button',{name:'저장',exact:true}).click();await naver.getByText('초안 · v3',{exact:true}).waitFor();
 assert.equal(await page.locator('#contentWorkspace img').count(),0);
 fs.mkdirSync('/tmp/momentum-content-tests',{recursive:true});
 await page.locator('#contentWorkspace').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/momentum-content-tests/desktop.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.table-controls').isHidden());await page.screenshot({path:`/tmp/momentum-content-tests/mobile-${width}.png`,fullPage:true});}
 await page.evaluate(()=>setMainTab('INBOUND'));assert(await page.locator('#contentWorkspace').isHidden());
 await page.evaluate(()=>setMainTab('CONTENT'));assert.equal(await page.getByLabel('네이버 본문',{exact:true}).inputValue(),'<img src=x onerror=alert(1)> 수정');
 // New session opens the most recently generated topic, not newest registration or edit.
 const newer=sandbox.contentRoute_({action:'content.topic.add',title:'두 번째 생성 주제',question:'질문',intent:'해결 탐색',evidence:'테스트'}).topics.at(-1);
 sandbox.contentRoute_({action:'content.generate',topicId:newer.id});
 const newerJob=sandbox.contentRoute_({action:'content.worker.claim',requestId:crypto.randomUUID()}).job;
 sandbox.contentRoute_({action:'content.worker.complete',jobId:newerJob.id,claim:newerJob.claim,outputs:Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:'최근 생성 제목',body:'최근 생성 본문'}]))});
 sandbox.contentRoute_({action:'content.topic.add',title:'아직 생성 안 한 최신 등록',question:'질문',intent:'해결 탐색',evidence:'테스트'});
 const db=JSON.parse(raw);db.articles[job.topic.id+':naver'].versions.at(-1).createdAt=Date.now()+100000;raw=JSON.stringify(db);
 await page.reload();
 await page.evaluate(async()=>{MomentumAdmin.call=async(action,payload)=>{const r=await window.contentTestCall(action,payload);if(!r.ok){const e=Error(r.error);e.code=r.error;throw e;}return r.result};document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';setMainTab('CONTENT');});
 await page.getByLabel('네이버 본문',{exact:true}).waitFor();
 assert.equal(await page.locator('.content-topic h3').first().textContent(),'두 번째 생성 주제');
 assert.equal(await page.locator('.content-topic h3').last().textContent(),'아직 생성 안 한 최신 등록');
 assert.equal(await page.getByLabel('네이버 본문',{exact:true}).inputValue(),'최근 생성 본문');
 const deliveryCard=page.locator('.content-draft').filter({has:page.getByRole('heading',{name:'티스토리',exact:true})});
 assert(await deliveryCard.getByRole('button',{name:'공개 발행',exact:true}).isDisabled());
 await deliveryCard.getByRole('button',{name:'검수 완료',exact:true}).click();
 await deliveryCard.getByText('검수 완료 · v1',{exact:true}).waitFor();
 assert(!(await deliveryCard.getByRole('button',{name:'공개 발행',exact:true}).isDisabled()));
 page.once('dialog',dialog=>dialog.dismiss());await deliveryCard.getByRole('button',{name:'공개 발행',exact:true}).click();
 assert.equal(sandbox.contentRoute_({action:'content.get'}).deliveries.length,0);
 await deliveryCard.getByRole('button',{name:'임시저장 요청',exact:true}).click();await deliveryCard.getByText('임시저장 v1 · 대기',{exact:false}).waitFor();
 assert(await deliveryCard.getByLabel('티스토리 본문',{exact:true}).isDisabled());
 await deliveryCard.getByRole('button',{name:'요청 취소',exact:true}).click();await deliveryCard.getByText('임시저장 v1 · 취소',{exact:true}).waitFor();
 assert(!(await deliveryCard.getByLabel('티스토리 본문',{exact:true}).isDisabled()));
 await page.getByLabel('네이버 본문',{exact:true}).fill('편집 중 보호');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('.content-topic').nth(1).getByRole('button',{name:'글 열기',exact:true}).click();
 assert.equal(await page.getByLabel('네이버 본문',{exact:true}).inputValue(),'편집 중 보호');
 // A completed new version must not overwrite edits made while it was generating.
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'새 버전 생성',exact:true}).click();
 const backgroundJob=sandbox.contentRoute_({action:'content.worker.claim',requestId:crypto.randomUUID()}).job;
 await page.getByLabel('네이버 본문',{exact:true}).fill('생성 중 사용자 편집 보존');
 sandbox.contentRoute_({action:'content.worker.complete',jobId:backgroundJob.id,claim:backgroundJob.claim,outputs:Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:'새 결과',body:'완료된 새 결과'}]))});
 await page.getByText('생성 작업이 끝났습니다. 편집 중인 내용을 저장한 뒤 결과를 불러오세요.',{exact:true}).waitFor({timeout:15000});
 assert.equal(await page.getByLabel('네이버 본문',{exact:true}).inputValue(),'생성 중 사용자 편집 보존');
 assert.equal(await page.locator('#contentGenerationProgress progress').evaluate(el=>el.value),100);
 assert.deepEqual(errors,[]);console.log('Content UI desktop/mobile, queue, multi-editor persistence, review and escaped preview PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
