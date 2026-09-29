const {chromium}=require('../automation/blog/node_modules/playwright');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let raw,props={};const file={getId:()=> 'fixture',getBlob:()=>({getDataAsString:()=>raw}),setContent:s=>raw=s};
const context={Date,JSON,Utilities:{getUuid:()=>crypto.randomUUID()},DriveApp:{createFile:(_,s)=>{raw=s;return file;},getFileById:()=>file},adminProps_:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v}),adminLock_:fn=>fn()};
vm.createContext(context);vm.runInContext(fs.readFileSync('server/apps-script/ContentStore.gs','utf8'),context);
const call=(action,p={})=>JSON.parse(JSON.stringify(context.contentRoute_({action,...p})));
const board={id:'fixture-board',observedAt:new Date().toISOString(),groups:['naver','datalab','vidiq'].map(id=>({id,title:id,basis:'검증용 표본 내 순서',limitations:'실제 검색량이 아닌 테스트 데이터',rows:Array.from({length:10},(_,i)=>({keyword:'촬영 키워드 '+i,category:'촬영',metric:i===0?'판단 보류':'검증 지표 '+i,reason:'테스트 추천 이유',question:'촬영 준비에서 무엇을 정할까?',observedAt:new Date().toISOString(),detail:'<img src=x onerror=alert(1)>',links:[{label:'테스트 근거',url:'https://search.naver.com/search.naver?query=test'}]}))}))};
assert.equal(call('content.get').keywordBoard,null);call('content.topic.add',{title:'기존 주제',question:'기존 질문',intent:'해결 탐색',evidence:'보존 대상'});
const invalid=structuredClone(board);invalid.groups[0].rows[0].links[0].url='javascript:alert(1)';assert.throws(()=>call('content.keywords.save',{board:invalid}),/INVALID/);
const duplicate=structuredClone(board);duplicate.groups[0].rows[1].keyword=duplicate.groups[0].rows[0].keyword;assert.throws(()=>call('content.keywords.save',{board:duplicate}),/DUPLICATE/);
call('content.keywords.save',{board});assert.equal(call('content.get').topics.length,1);const revision=call('content.get').revision;call('content.keywords.save',{board});assert.equal(call('content.get').revision,revision);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>{const u=new URL(r.request().url()),file=path.join(process.cwd(),u.pathname);if(u.hostname==='momentum.local'&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});return r.fulfill({body:'[]',contentType:'application/json'});});
await page.exposeFunction('testCall',(action,payload)=>call(action,payload));await page.goto('http://momentum.local/admin.html');await page.evaluate(()=>{MomentumAdmin.call=window.testCall;document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';setMainTab('CONTENT');});
await page.locator('.keyword-row').first().waitFor();assert.equal(await page.locator('.keyword-group').count(),3);assert.equal(await page.locator('.keyword-row').count(),30);assert.equal(await page.locator('#contentKeywords img').count(),0);
const first=page.locator('.keyword-row').first();await first.locator('summary').click();await first.getByRole('button',{name:'이 키워드로 주제 준비'}).click();assert.equal(await page.locator('#contentTopicForm [name=title]').inputValue(),'촬영 키워드 0');assert((await page.locator('#contentTopicForm [name=evidence]').inputValue()).includes('https://search.naver.com/'));assert.equal(call('content.get').topics.length,1);assert.equal(call('content.get').jobs.length,0);
for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
assert.deepEqual(errors,[]);console.log('Keyword board: private persistence, validation, idempotence, 3x10 UI, safe text, topic preparation, desktop/mobile PASS');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
