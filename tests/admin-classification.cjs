const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const outcome of ['success','failed','unknown']){
  const context=await browser.newContext({viewport:{width:390,height:844}});let starts=0,phase='accepted',loginCount=0,token='a'.repeat(128);const errors=[],actions=[];
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),json=(v)=>route.fulfill({body:JSON.stringify(v),contentType:'application/json'});
   if(u.hostname==='momentum.local'){const f=path.join(process.cwd(),u.pathname);if(fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({path:f});}
   assert.notEqual(u.hostname,'api.github.com','Browser must never access GitHub API');
   if(u.hostname==='script.google.com'&&req.method()==='POST'){
    const r=JSON.parse(req.postData());assert.equal(r.route,'momentum_admin');actions.push(r.action);
    if(r.action==='login'){loginCount++;if(r.password!=='demo-password')return json({ok:false,error:'INVALID_LOGIN'});return json({ok:true,result:{token,expiresAt:Date.now()+3600000}});}
    if(r.session!==token)return json({ok:false,error:'UNAUTHORIZED'});
    if(r.action==='session')return json({ok:true,result:{expiresAt:Date.now()+3600000}});
    if(r.action==='logout'){token='';return json({ok:true,result:{loggedOut:true}});}
    if(r.action==='classify.start'){starts++;if(outcome==='unknown')return route.abort();return json({ok:true,result:{phase:'accepted',runId:42,status:'queued'}});}
    if(r.action==='classify.status')return json({ok:true,result:{phase,runId:42,conclusion:phase==='failed'?'failure':phase==='success'?'success':null}});
    throw Error('Unexpected action '+r.action);
   }
   return json([]);
  });
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install();
  await p.addInitScript(()=>{window.prompt=()=>{throw Error('Token prompt forbidden');};localStorage.setItem('sm_admin_persistent_auth','old-public-hash');sessionStorage.setItem('sm_admin_authenticated','true');});
  await p.goto('http://momentum.local/admin.html');assert(await p.locator('#loginOverlay').isVisible());
  await p.locator('#username').fill('admin');await p.locator('#password').fill('wrong');await p.locator('.login-btn').click();await p.waitForFunction(()=>document.getElementById('loginError').textContent.includes('일치하지'));
  await p.locator('#password').fill('demo-password');await p.locator('.login-btn').click();await p.waitForFunction(()=>document.getElementById('dashboardApp').style.display==='block');
  assert.equal(await p.locator('#password').inputValue(),'');
  await p.evaluate(()=>Promise.all([MomentumClassification.start(),MomentumClassification.start()]));assert.equal(starts,1);
  assert(!(await p.locator('#classifyStatus').textContent()).includes('완료'));
  if(outcome==='unknown'){assert((await p.locator('#classifyStatus').textContent()).includes('확인 필요'));await p.evaluate(()=>MomentumClassification.start());assert.equal(starts,1);}
  phase='running';await p.clock.runFor(5001);await p.waitForFunction(()=>document.getElementById('classifyStatus').textContent.includes('실행 중'));
  for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await p.locator('#classifyButton').boundingBox()).height>=44);}
  phase=outcome==='failed'?'failed':'success';await p.clock.runFor(5001);await p.waitForFunction(()=>!document.getElementById('classifyButton').disabled);assert((await p.locator('#classifyStatus').textContent()).includes(phase==='failed'?'실행 실패':'실행 완료'));
  const stored=await p.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert(!stored.includes('demo-password'));assert(!stored.includes('old-public-hash'));
  await p.reload();await p.waitForFunction(()=>document.getElementById('dashboardApp').style.display==='block');assert(actions.includes('session'));assert.equal(loginCount,2);
  assert.deepEqual(errors,[]);assert.equal(starts,1);console.log('PASS session relay',outcome,'one dispatch, no GitHub token prompt/API, server login and restore, mobile');await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
