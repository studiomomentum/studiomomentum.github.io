const {chromium}=require('../automation/blog/node_modules/playwright');const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base={revision:1,workerSeenAt:Date.now(),topics:[{id:'cache-topic',title:'캐시 테스트',question:'질문',intent:'검증',evidence:'fixture',createdAt:1}],articles:{},jobs:[],deliveries:[],keywordBoard:null};
for(const platform of ['naver','tistory','threads'])base.articles['cache-topic:'+platform]={id:'cache-topic:'+platform,topicId:'cache-topic',platform,reviewedVersion:null,versions:[{title:platform,body:'저장된 원문',createdAt:1,origin:'generated'}]};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));let calls=0,release;
await p.route('**/*',r=>{const u=new URL(r.request().url()),f=path.join(process.cwd(),u.pathname);if(u.hostname==='momentum.local'&&fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({body:'[]',contentType:'application/json'});});
await p.exposeFunction('cacheFixtureGet',()=>{calls++;return new Promise(resolve=>release=resolve);});
const setup=async(scope='session-a')=>p.evaluate(scope=>{MomentumAdmin.cacheScope=async()=>scope;MomentumAdmin.call=async action=>{if(action!=='content.get')throw Error('READ_ONLY');return window.cacheFixtureGet();};document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';setMainTab('CONTENT');},scope);
await p.goto('http://momentum.local/admin.html');await setup();await p.waitForFunction(()=>document.getElementById('contentNotice').textContent.includes('불러오는 중'));
while(!release)await new Promise(r=>setTimeout(r,10));assert.equal(await p.locator('.content-draft').count(),0);release(base);
await p.getByLabel('네이버 본문',{exact:true}).waitFor();assert.equal(calls,1);
assert(await p.evaluate(()=>!!sessionStorage.getItem('sm_content_cache_v1')));
await p.getByLabel('네이버 본문',{exact:true}).fill('미저장 편집');
await p.evaluate(()=>{setMainTab('INBOUND');setMainTab('CONTENT');});assert.equal(await p.getByLabel('네이버 본문',{exact:true}).inputValue(),'미저장 편집');assert.equal(calls,1);
p.once('dialog',d=>d.accept());await p.reload();release=null;const start=Date.now();await setup();
await p.getByLabel('네이버 본문',{exact:true}).waitFor({timeout:1000});const warmMs=Date.now()-start;
assert.equal(await p.getByLabel('네이버 본문',{exact:true}).inputValue(),'저장된 원문'); // Unsaved text was never cached.
while(!release)await new Promise(r=>setTimeout(r,10));assert.equal(calls,2);
// Manual reload shares the background request rather than issuing another RPC.
await p.getByRole('button',{name:'결과 불러오기',exact:true}).click();assert.equal(calls,2);
const changed=JSON.parse(JSON.stringify(base));changed.revision=2;changed.articles['cache-topic:naver'].versions[0].body='서버 최신 원문';release(changed);
await p.waitForFunction(()=>document.querySelector('[aria-label="네이버 본문"]').value==='서버 최신 원문');
// Background revalidation must not replace newly typed text.
await p.reload();release=null;await setup();await p.getByLabel('네이버 본문',{exact:true}).waitFor({timeout:1000});
await p.getByLabel('네이버 본문',{exact:true}).fill('조회 중 새 편집');while(!release)await new Promise(r=>setTimeout(r,10));
const latest=JSON.parse(JSON.stringify(changed));latest.revision=3;latest.articles['cache-topic:naver'].versions[0].body='더 최신 서버 원문';release(latest);
await p.waitForFunction(()=>JSON.parse(sessionStorage.getItem('sm_content_cache_v1')).snapshot.revision===3);
assert.equal(await p.getByLabel('네이버 본문',{exact:true}).inputValue(),'조회 중 새 편집');
p.once('dialog',d=>d.accept());
// A different authenticated session may not reuse the old session's private data.
await p.reload();release=null;await setup('session-b');
assert.equal(await p.locator('.content-draft').count(),0);while(!release)await new Promise(r=>setTimeout(r,10));
await p.evaluate(()=>window.dispatchEvent(new Event('momentum-auth-cleared')));release(base);
await p.waitForFunction(()=>document.querySelectorAll('.content-draft').length===0);
// Exercise real auth invalidation rather than only the content-layer event.
const authPage=await browser.newPage();await authPage.route('**/*',r=>r.fulfill({body:'<div id="dashboardApp"></div><div id="loginOverlay"></div><div id="loginError"></div>',contentType:'text/html'}));await authPage.goto('https://auth.local/');
await authPage.evaluate(()=>{window.GAS_DB_URL='https://relay.local/';window.initDashboard=async()=>{};window.fetch=async()=>({ok:true,json:async()=>({ok:true,result:{token:'test-only-token',expiresAt:Date.now()+60000}})});});
await authPage.addScriptTag({content:fs.readFileSync('assets/admin-auth.js','utf8')});
await authPage.evaluate(async()=>{await MomentumAdmin.login('fixture','fixture',false);sessionStorage.setItem('sm_content_cache_v1','private-fixture');});
assert.equal((await authPage.evaluate(()=>MomentumAdmin.cacheScope())).length,64);
await authPage.evaluate(async()=>{window.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'UNAUTHORIZED'})});try{await MomentumAdmin.call('session');}catch{}});
assert.equal(await authPage.evaluate(()=>sessionStorage.getItem('sm_content_cache_v1')),null);
assert.equal(await authPage.evaluate(()=>MomentumAdmin.cacheScope()),null);await authPage.close();
assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',warmCacheMs:warmMs,checks:['memory tab reuse','session reload before server reply','unsaved text excluded','deduplicated request','latest response applied','background response preserves edits','session isolation','late response after logout ignored']}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
