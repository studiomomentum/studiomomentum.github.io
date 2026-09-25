const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  async function scenario(kind){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    let posts=0,status='queued',conclusion=null;
    const errors=[];
    await context.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.hostname==='momentum.local'){
        const file=path.join(process.cwd(),u.pathname);
        if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
      }
      const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
      if(u.hostname==='api.github.com'){
        if(u.pathname==='/user')return json({login:'test-operator'});
        if(u.pathname.endsWith('/dispatches')){
          posts++;assert(u.pathname.endsWith('/auto_prospect.yml/dispatches'));
          assert.deepEqual(req.postDataJSON(),{ref:'main',inputs:{force:true},return_run_details:true});
          if(kind==='denied')return route.fulfill({status:403,body:'{}'});
          if(kind==='lost')return route.abort();
          return json({workflow_run_id:42});
        }
        if(u.pathname.endsWith('/runs/42'))return json({id:42,status,conclusion,event:'workflow_dispatch',head_branch:'main',path:'.github/workflows/auto_prospect.yml'});
        if(u.pathname.endsWith('/runs'))return json({workflow_runs:kind==='existing'?[{id:42,status:'in_progress'}]:[]});
        throw new Error('Unexpected API '+u.pathname);
      }
      return json([]);
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install();await page.goto('http://momentum.local/admin.html');
    await page.evaluate(async()=>{window.prompt=()=> 'test-only-token';await loadTargets();document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';updateKPIs();renderTable();});
    await page.evaluate(()=>Promise.all([MomentumClassification.start(),MomentumClassification.start()]));
    const message=()=>page.locator('#classifyStatus').textContent();
    if(kind==='denied'){assert((await message()).includes('접수 실패'));assert.equal(posts,1);}
    else if(kind==='lost'){
      assert((await message()).includes('접수 결과 확인 필요'));
      await page.evaluate(()=>MomentumClassification.start());assert.equal(posts,1); // no repeat POST
    }else{
      assert((await message()).includes('접수됨'));assert(!(await message()).includes('완료'));
      assert(await page.locator('#classifyButton').isDisabled());assert.equal(posts,kind==='existing'?0:1);
      status='in_progress';await page.clock.runFor(5001);await page.waitForFunction(()=>document.getElementById('classifyStatus').textContent.includes('실행 중'));
      if(kind==='success'){
        const dir=process.env.UI_ARTIFACT_DIR||'/tmp/momentum-classification-tests';fs.mkdirSync(dir,{recursive:true});
        await page.screenshot({path:path.join(dir,'mobile-running.png')});
        for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await page.locator('#classifyButton').boundingBox()).height>=44);}
      }
      status='completed';conclusion=kind==='failure'?'failure':kind==='cancelled'?'cancelled':'success';
      await page.clock.runFor(5001);await page.waitForFunction(()=>!document.getElementById('classifyButton').disabled);
      assert((await message()).includes(conclusion==='success'?'실행 완료':'실행 실패'));
    }
    const storage=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert(!storage.includes('test-only-token'));assert.deepEqual(errors,[]);
    console.log('PASS',kind,'dispatches',posts);await context.close();
  }
  for(const kind of ['success','failure','cancelled','denied','lost','existing'])await scenario(kind);
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
