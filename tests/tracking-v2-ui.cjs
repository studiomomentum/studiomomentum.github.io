const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const context=await browser.newContext(),saved=new Map(),posts=[],errors=[];let offline=false,confirm=true;
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url()),file=path.join(process.cwd(),u.pathname);
  if(u.hostname==='studiomomentum.github.io'&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
  const fixture=process.env.OPS_ASSET_FIXTURES&&path.join(process.env.OPS_ASSET_FIXTURES,path.basename(u.pathname));
  if(u.hostname==='studiomomentum.github.io'&&fixture&&fs.existsSync(fixture))return route.fulfill({path:fixture});
  if(u.hostname==='studiomomentum.github.io'&&u.pathname==='/')return route.fulfill({path:path.join(process.cwd(),'index.html')});
  if(u.hostname==='ntfy.sh'||u.hostname==='script.google.com'){
   if(offline)return route.abort('internetdisconnected');
   if(req.method()==='POST'){
    const body=JSON.parse(req.postData());posts.push(...(Array.isArray(body)?body:[body]));
    if(u.hostname==='script.google.com'&&confirm)for(const ev of (Array.isArray(body)?body:[body]))saved.set(ev.event_id,ev);
    return route.fulfill({body:'{}',contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'}});
   }
   return route.fulfill({body:u.hostname==='ntfy.sh'?'':JSON.stringify([...saved.values()]),contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'}});
  }
  return route.fulfill({body:'{}',contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();
 await page.goto('https://studiomomentum.github.io/suwon-hospital.html');
 await page.evaluate(()=>MomentumCollector.flush(true));
 const entry=[...saved.values()].find(e=>e.event==='visit');assert(entry);assert.equal(entry.channel_type,'PSEO');
 await page.clock.runFor(11000);await page.evaluate(()=>MomentumCollector.flush(true));assert([...saved.values()].some(e=>e.event==='duration_10s'));
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(120000);const backgroundSeconds=await page.evaluate(()=>MomentumCollector.status());
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(2000);await page.evaluate(()=>MomentumCollector.flush(true));
 assert(![...saved.values()].some(e=>e.event==='duration_30s'));
 await page.locator('.nav-link a').click();await page.waitForLoadState();await page.evaluate(()=>MomentumCollector.flush(true));
 const main=[...saved.values()].find(e=>e.event==='visit'&&e.path==='/');assert(main);assert.equal(main.ref,entry.ref);assert.equal(main.meta.session_id,entry.meta.session_id);assert.notEqual(main.meta.visit_id,entry.meta.visit_id);
 await page.evaluate(()=>window._smSendEvent('kakao_click',{elapsed:1}));await page.evaluate(()=>MomentumCollector.flush(true));
 assert([...saved.values()].some(e=>e.event==='kakao_click'&&e.ref===entry.ref));
 // Offline records persist over a real navigation/reload and only clear after archive readback.
 offline=true;await page.evaluate(()=>window._smSendEvent('roi_calc_change',{salary:400}));await page.evaluate(()=>MomentumCollector.flush(true));assert((await page.evaluate(()=>MomentumCollector.status().pending))>0);
 await page.reload();assert((await page.evaluate(()=>MomentumCollector.status().pending))>0);
 offline=false;confirm=false;await page.evaluate(()=>MomentumCollector.flush(true));assert((await page.evaluate(()=>MomentumCollector.status().pending))>0);
 confirm=true;await page.evaluate(()=>MomentumCollector.flush(true));assert.equal(await page.evaluate(()=>MomentumCollector.status().pending),0);
 assert(posts.filter(e=>e.event==='roi_calc_change').every(e=>e.event_id===posts.find(x=>x.event==='roi_calc_change').event_id));
 // Board reproduction: one page view, a duplicate view and two interactions count once.
 await page.goto('https://studiomomentum.github.io/ops.html');
 const metrics=await page.evaluate(()=>{liveEvents=Momentum.mergeEvents([{...window.fixture,event:'visit',ref:'pseo_testreal',event_id:'pv',timestamp:Date.now(),channel_type:'PSEO',region:'수원',industry:'병원',meta:{visit_id:'page'}},{event:'view',ref:'pseo_testreal',event_id:'view',timestamp:Date.now(),channel_type:'PSEO',meta:{visit_id:'page'}},{event:'scroll_50',ref:'pseo_testreal',event_id:'scroll',timestamp:Date.now(),channel_type:'PSEO'},{event:'duration_10s',ref:'pseo_testreal',event_id:'stay',timestamp:Date.now(),channel_type:'PSEO',meta:{duration:10}}]);updatePseoBoard();return {badge:document.getElementById('pseoTotalBadge').textContent,roi:document.getElementById('pseoGeoStats').textContent};});
 assert(metrics.badge.includes('pSEO 1회'),metrics.badge);assert(metrics.roi.includes('기록 없음'));assert(!metrics.roi.includes('2,970'));assert.deepEqual(errors,[]);
 console.log('PASS: real landing→main→consultation journey, visible/background clock, reload/offline durable queue, opaque response not ack, archive readback, deduplicated board, no browser errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
