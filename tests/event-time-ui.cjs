const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const context=await browser.newContext({timezoneId:'America/Los_Angeles'}),errors=[];
 await context.route('**/*',route=>{const url=new URL(route.request().url()),file=path.join(process.cwd(),url.pathname);if(url.hostname==='momentum.local'&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});return route.fulfill({body:url.hostname==='ntfy.sh'?'':'[]',contentType:'application/json'});});
 const page=await require('./isolate-telemetry.cjs')(context).then(()=>context.newPage());page.on('pageerror',e=>errors.push(e.message));await page.goto('http://momentum.local/ops.html');
 await page.evaluate(()=>{
  for(const id of ['opsLogin','opsWorkspace','momentumManagement']){const el=document.getElementById(id);if(el)el.hidden=id==='opsLogin';}
  document.getElementById('dashboardApp').style.display='block';targetsMap={};
  liveEvents=Momentum.mergeEvents([
   {event_id:'old',ref:'inbound_legacy',event:'visit',time:'2026. 9. 23. 오후 5:05:44',channel_type:'SEO',channel_name:'구글 검색'},
   {event_id:'stay',ref:'inbound_legacy',event:'scroll_50',time:'2026. 9. 23. 오후 5:06:44',meta:{elapsed:60}},
   {event_id:'missing',ref:'inbound_missing',event:'visit',time:'broken',channel_type:'DIRECT'}
  ]);setMainTab('INBOUND');
 });
 const rows=await page.evaluate(()=>getInboundList());assert.equal(rows.find(r=>r.token==='inbound_legacy').maxStaySec,60);assert.equal(rows.find(r=>r.token==='inbound_missing').lastSeen,0);
 await page.evaluate(()=>openTargetDetail('inbound_legacy'));let body=await page.locator('#detailBody').innerText();assert(body.includes('2026. 9. 23.'));assert(body.includes('오후 5:05:44'));assert(!body.includes('1970'));await page.keyboard.press('Escape');
 await page.evaluate(()=>openTargetDetail('inbound_missing'));body=await page.locator('#detailBody').innerText();assert(body.includes('시각 미기록'));assert(!body.includes('1970'));await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>openTargetDetail('inbound_legacy'));assert((await page.locator('#detailBody').innerText()).includes('2026. 9. 23.'));
 fs.mkdirSync('/tmp/momentum-date-ui',{recursive:true});await page.screenshot({path:'/tmp/momentum-date-ui/mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: natural inbound list/details, recovered KST under US timezone, missing time label, elapsed duration, mobile UI, no browser errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
