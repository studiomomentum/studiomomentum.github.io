const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const regions=['수원','동탄','오산','평택','용인','화성','분당','판교','강남','서초','송파'];
 let fixture={region:'수원',phase:'search',updated_at:new Date().toISOString(),queries_completed:25,queries_total:429,channels_discovered:2750,channels_observed:1000,query_errors:{'수원 의원':'403'},search_stage:{status:'running',region:'동탄'},classification:{status:'running',total:100,processed:60,pending:38,processing:2,eligible:5,review:20,rejected:30,errors:5,ready:3,active:[{name:'수원 테스트 채널',query:'수원 세무사'},{name:'동탄 테스트 채널',channel_id:'context-test'}]},regions:regions.map(name=>({name,queries_completed:25,queries_total:39,channels:2750,observed:1000,observation_errors:2,jobs:Array.from({length:39},(_,i)=>({name:'업종 '+i,status:i<25?'completed':i===25?'running':i===26?'error':'pending',channels:20,results_read:100}))}))};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname.endsWith('/search-progress.json'))return r.fulfill({json:fixture});const f=path.join(process.cwd(),u.pathname);if(u.hostname==='momentum.local'&&fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({body:'[]',contentType:'application/json'});});
 await page.goto('http://momentum.local/admin.html');
 await page.evaluate(()=>{document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';setMainTab('SEARCH_DB');});
 await page.waitForSelector('.search-region');
 assert.equal(await page.locator('.search-region').count(),11);assert.equal(await page.locator('.search-job').count(),39);
 assert((await page.locator('.search-live-state').textContent()).includes('동탄 · 진행 중'));
 assert((await page.locator('.classification-progress').textContent()).includes('60 / 100'));
 assert((await page.locator('.classification-active').textContent()).includes('수원 테스트 채널'));
 assert((await page.locator('.classification-active').textContent()).includes('수원 · 세무사'));
 await page.evaluate(()=>{targetsMap._classification_context={'context-test':'동탄 정형외과'};});
 await page.locator('#refreshSearchProgress').click();
 await page.waitForFunction(()=>document.querySelector('.classification-active').textContent.includes('동탄 · 정형외과'));
 assert((await page.locator('.classification-progress').textContent()).includes('검색어 기준'));
 await page.locator('[data-search-region="동탄"]').click();assert((await page.locator('#searchProgress h4').textContent()).includes('동탄'));
 assert((await page.locator('.search-progress-heading').textContent()).includes('23:00'));
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/tmp/search-progress-${width}.png`,fullPage:true});}
 fixture={...fixture,updated_at:new Date(Date.now()-600000).toISOString()};await page.locator('#refreshSearchProgress').click();await page.waitForFunction(()=>document.querySelector('.search-live-state').textContent.includes('갱신 지연'));
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: 11 regions, 39 jobs, selection, schedule, stale state, PC/mobile widths');
})().catch(e=>{console.error(e);process.exit(1)});
