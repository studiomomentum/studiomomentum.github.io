const {chromium}=require('../automation/blog/node_modules/playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"});let errors=[],requests=[],events=[];
 const c=await browser.newContext({viewport:{width:1440,height:1000}});let online=true,messages=[],pending=null,lostSend=false;
 await c.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(u.hostname==='momentum.local'){const f=path.join(process.cwd(),u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});}
  if(r.request().method()==='POST'){
   let b;try{b=JSON.parse(r.request().postData());}catch{}
   if(b?.route==='momentum_consult'){
    requests.push(b);let result={};
    if(b.action==='status')result={online};
    if(b.action==='start')result={id:'fixture',expiresAt:Date.now()+86400000,messages:[],pending:null,turns:0};
    if(b.action==='send'){
     if(!messages.some(m=>m.requestId===b.requestId)){messages.push({role:'user',text:b.text,requestId:b.requestId});pending={requestId:b.requestId,state:'queued'};}
     result={messages,pending};if(lostSend){lostSend=false;return r.abort();}
    }
    if(b.action==='poll'){if(pending){messages.push({role:'assistant',text:'현장 촬영을 도와드릴 수 있어요',requestId:pending.requestId});pending=null;}result={messages,pending};}
    if(b.action==='handoff')result={saved:true};
    return r.fulfill({json:{ok:true,result}});
   }
  }
  return r.fulfill({json:u.pathname.includes('system_config')?{client_access_blocked:false}:[]});
 });
 const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const mode of ['inbound','outbound']){
  await page.goto('https://momentum.local/?admin=1&preview_mode='+mode+(mode==='outbound'?'&vip':''));
  assert.equal(await page.evaluate(()=>window._smChannelType==='OUTBOUND'),mode==='outbound');
  const prices=await page.locator('.price-num').allTextContents();assert(prices[0].includes(mode==='outbound'?'50만':'60만'));assert(prices[1].includes(mode==='outbound'?'280만':'320만'));
  assert.equal(await page.locator('button[onclick^="openPayAppModal"]').count(),0);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);}
 }
 await page.evaluate(()=>{window._testEvents=[];window._smSendEvent=(event,meta)=>window._testEvents.push({event,meta});});
 await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>window._testEvents.filter(e=>e.event==='roi_calc_change').length),0);
 await page.locator('[data-consult-open="hero"]').click();assert(await page.locator('dialog').isVisible());
 await page.locator('.consult-form textarea').fill('<img src=x onerror=alert(1)> 촬영 시간이 없어요');lostSend=true;await page.locator('.consult-form button').click();
 await page.waitForFunction(()=>document.querySelector('.consult-status').textContent.includes('전송 결과'));
 await page.locator('.consult-form button').click();await page.waitForFunction(()=>document.querySelector('.consult-messages').textContent.includes('현장 촬영을 도와'));
 assert.equal(messages.filter(m=>m.role==='user').length,1);assert.equal(await page.locator('.consult-messages img').count(),0);
 await page.locator('[data-summary]').click();assert((await page.locator('#consultSummaryText').inputValue()).includes('촬영 시간이 없어요'));
 await page.locator('#consultSummaryText').fill('수정한 상담 내용');assert.equal(await page.locator('[data-summary-kakao]').getAttribute('href'),'https://open.kakao.com/o/sEX8RWNi');
 await page.keyboard.press('Escape');assert(!await page.locator('dialog').isVisible());
 online=false;await page.locator('[data-consult-open="hero"]').click();await page.waitForFunction(()=>document.querySelector('.consult-status').textContent.includes('쉬고 있어요'));
 assert(await page.locator('.consult-footer a').isVisible());
 events=await page.evaluate(()=>window._testEvents);assert(events.some(e=>e.event==='ai_chat_start'));assert(!JSON.stringify(events).includes('촬영 시간이'));
 fs.mkdirSync('/tmp/momentum-consult-ui',{recursive:true});await page.screenshot({path:'/tmp/momentum-consult-ui/mobile-chat.png'});
 await page.keyboard.press('Escape');await page.screenshot({path:'/tmp/momentum-consult-ui/mobile-page.png'});
 assert.deepEqual(errors,[]);await browser.close();console.log('consultation UI: both prices, mobile, retry, XSS, handoff, offline, telemetry PASS');
})().catch(e=>{console.error(e);process.exit(1);});
