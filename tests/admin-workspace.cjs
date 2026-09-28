const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const fs=require('fs'),path=require('path'),assert=require('assert');
const artifactDir=process.env.UI_ARTIFACT_DIR||'/tmp/momentum-workspace-tests';fs.mkdirSync(artifactDir,{recursive:true});
(async()=>{const b=await chromium.launch({headless:true});const c=await b.newContext({viewport:{width:1440,height:1000}});const errors=[];let writes=[];await c.route('**/*',r=>{const u=new URL(r.request().url());const f=path.join(process.cwd(),u.pathname==='/'?'index.html':u.pathname);if(u.hostname==='momentum.local'&&fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});if(r.request().method()==='POST')writes.push(u.href);return r.fulfill({body:u.hostname==='ntfy.sh'?'':'[]',contentType:'application/json'});});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://momentum.local/admin.html');await p.evaluate(async()=>{await loadTargets();document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';updateKPIs();renderTable();});
// Occupation filter combines with delivery/search and applies to both layouts.
await p.evaluate(()=>{window.occupationBackup=targetsMap;targetsMap={a:{token:'a',company:'법률 대상',status:'READY',category:'legal'},b:{token:'b',company:'의료 대상',status:'READY',category:'medical'},c:{token:'c',company:'발송 법률',status:'SENT',category:'legal'},d:{token:'d',company:'분류 없음',status:'READY'}};setMainTab('READY');});
await p.locator('#occupationFilter').selectOption('legal');
assert.equal(await p.locator('#tableBody .target-link').count(),1);
assert.equal(await p.locator('#mobileCardsContainer .target-link').count(),1);
assert((await p.locator('#resultSummary').textContent()).includes('변호사·법률'));
await p.locator('#searchInput').fill('의료');assert.equal(await p.locator('#tableBody .target-link').count(),0);
await p.locator('#searchInput').fill('');await p.locator('#occupationFilter').selectOption('UNKNOWN');assert.equal(await p.locator('#tableBody .target-link').count(),1);
for(const width of [320,390]){await p.setViewportSize({width,height:844});assert(await p.locator('#occupationFilter').isVisible());assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await p.evaluate(()=>{setMainTab('INBOUND');});assert.equal(await p.locator('#occupationFilter').count(),0);
await p.evaluate(()=>{targetsMap=window.occupationBackup;setMainTab('READY');});assert.equal(await p.locator('#occupationFilter').inputValue(),'ALL');await p.setViewportSize({width:1440,height:1000});
await p.evaluate(()=>{window.scoreTestBackup=targetsMap;targetsMap={score_low:{token:'score_low',company:'Low fixture',status:'READY',prospect_score:'35',prospect_grade:'LOW',no:'1',is_priority:true},score_high:{token:'score_high',company:'High fixture',status:'READY',prospect_score:'85',prospect_grade:'HIGH',no:'2',score_snapshot:JSON.stringify({score_components:{activity:15,production:30,performance:40},score_penalty:0,sample_size:10,recent_longform_median:200})}};setMainTab('READY');});
assert(await p.locator('#tableBody .prospect-score').count()>0);
const ranked=await p.evaluate(()=>Object.values(targetsMap).filter(t=>t.status==='READY').map(t=>Number(t.prospect_score)).sort((a,b)=>b-a));
const displayed=await p.locator('#tableBody .prospect-score strong').allTextContents();
assert.deepEqual(displayed.map(x=>Number(x.replace(/[^0-9.-]/g,''))),ranked);
await p.locator('#tableBody .target-link').first().click();
assert((await p.locator('#detailBody .score-breakdown').textContent()).includes('중앙값'));
await p.evaluate(()=>{document.getElementById('targetDetail').close();targetsMap=window.scoreTestBackup;});
for(const tab of ['SENT','READY','ALL','BOUNCED','REVIEW','EXCLUDED','SEARCH_DB','INBOUND']){await p.evaluate(t=>setMainTab(t),tab);console.log(tab,await p.locator('#resultSummary').textContent());}
await p.evaluate(()=>setMainTab('SENT'));const sent=await p.locator('#tableBody tr').count();assert(sent>0);await p.locator('#reactionFilter').selectOption('VISITED');console.log('visited',await p.locator('#resultSummary').textContent());assert.equal(await p.evaluate(()=>currentFilter),'VISITED');await p.locator('#deliveryFilter').selectOption('READY');assert.equal(await p.evaluate(()=>mainTab),'READY');await p.evaluate(()=>setMainTab('SENT'));await p.locator('#tableBody [data-detail-token]').first().click();assert(await p.locator('#targetDetail').isVisible());await p.keyboard.press('Escape');await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(artifactDir,'desktop.png')});
await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(artifactDir,'mobile.png')});assert(await p.locator('#mobileCardsContainer').isVisible());assert(!(await p.locator('#workspaceTable').isVisible()));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#mobileCardsContainer [data-detail-token]').first().click();assert(await p.locator('#targetDetail').isVisible());await p.keyboard.press('Escape');await p.evaluate(()=>setMainTab('READY'));assert.equal(await p.locator('#mobileCardsContainer .target-card').count(),await p.evaluate(()=>Object.values(targetsMap).filter(t=>t&&t.status==='READY').length));
for(const mode of ['outbound','inbound']){await p.evaluate(()=>{localStorage.setItem('sm_lead_ref','existing_customer');localStorage.setItem('sm_lead_comp','이전 고객');});const popupPromise=c.waitForEvent('page');await p.locator(`.page-shortcuts a[href*="preview_mode=${mode}"]`).click();const popup=await popupPromise;popup.on('pageerror',e=>errors.push(e.message));await popup.waitForLoadState();const actual=await popup.evaluate(()=>({channel:window._smChannelType,ref:localStorage.getItem('sm_lead_ref'),admin:localStorage.getItem('sm_admin_device')}));console.log('preview',mode,actual);assert.equal(actual.channel==='OUTBOUND',mode==='outbound');assert.equal(actual.ref,'existing_customer');await popup.close();}

// Channel links work in desktop/mobile lists; untrusted URLs never become links.
await p.evaluate(()=>{
  window.linkFixtureBackup=targetsMap;
  targetsMap={good:{token:'good',company:'테스트 채널',status:'READY',no:'1',channel_url:'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa'},bad:{token:'bad',company:'잘못된 URL',status:'READY',no:'2',channel_url:'https://youtube.com.evil.test/channel/UCaaaaaaaaaaaaaaaaaaaaaa'}};
  setMainTab('READY');
});
assert.equal(await p.locator('#tableBody .youtube-channel-link').count(),1);
assert.equal(await p.locator('#mobileCardsContainer .youtube-channel-link').count(),1);
const yt=p.locator('#mobileCardsContainer .youtube-channel-link');
assert.equal(await yt.getAttribute('target'),'_blank');
assert.equal(await yt.getAttribute('rel'),'noopener noreferrer');
const channelPopup=c.waitForEvent('page');await yt.click();const channelPage=await channelPopup;
await channelPage.waitForLoadState();assert.equal(channelPage.url(),'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa');await channelPage.close();
assert.equal(await p.locator('#targetDetail').isVisible(),false);
await p.evaluate(()=>{for(const channel_url of ['javascript:alert(1)','http://youtube.com/@name','https://youtube.com/watch?v=abc','https://evil.test/@name']){if(youtubeChannelButton({channel_url})!=='')throw Error('unsafe URL');}targetsMap=window.linkFixtureBackup;});

// Permanent exclusion is available on desktop/mobile and persists across stale refresh.
await p.evaluate(()=>{
  targetsMap={deadbeef:{token:'deadbeef',company:'제외 테스트',status:'READY',no:'1',channel_url:'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa',email:'test@example.com'}};
  window.exclusionWrites=0;
  MomentumAdmin.call=async(action,payload)=>{
    if(action==='targets.exclude')window.exclusionWrites++;
    return {entries:window.exclusionWrites?{deadbeef:{channel_url:'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa',email:'test@example.com'}}:{}};
  };setMainTab('READY');
});
assert.equal(await p.locator('#tableBody [data-exclude-token]').count(),1);
assert.equal(await p.locator('#mobileCardsContainer [data-exclude-token]').count(),1);
p.once('dialog',d=>d.dismiss());await p.locator('#mobileCardsContainer [data-exclude-token]').click();
assert.equal(await p.evaluate(()=>window.exclusionWrites),0);
p.once('dialog',d=>d.accept());await p.locator('#mobileCardsContainer [data-exclude-token]').click();
await p.waitForFunction(()=>targetsMap.deadbeef.status==='EXCLUDED');assert.equal(await p.evaluate(()=>window.exclusionWrites),1);
assert.equal(await p.locator('#mobileCardsContainer [data-exclude-token]').count(),0);
await p.evaluate(()=>{targetsMap.deadbeef.status='READY';applyPermanentExclusions();setMainTab('EXCLUDED');});
assert.equal(await p.locator('#mobileCardsContainer .target-card').count(),1);
await p.evaluate(()=>{permanentExclusions={};targetsMap=window.linkFixtureBackup;});

// Date range includes boundaries and excludes unsent rows; today uses KST.
await p.evaluate(()=>{targetsMap={a:{token:'a',company:'First',status:'SENT',sent_at:'2026-09-27 09:00:00'},b:{token:'b',company:'Second',status:'SENT',sent_at:'2026-09-28 12:00:00'},c:{token:'c',company:'Unsent',status:'READY'}};setMainTab('ALL');});
await p.locator('#sentDateFrom').fill('2026-09-28');
assert.equal(await p.locator('#mobileCardsContainer .target-card').count(),1);
assert((await p.locator('#mobileCardsContainer').textContent()).includes('Second'));
await p.locator('#sentDateClear').click();assert.equal(await p.locator('#mobileCardsContainer .target-card').count(),3);
await p.locator('#sentDateToday').click();assert.equal(await p.evaluate(()=>mainTab),'SENT');
assert.equal(await p.locator('#sentDateFrom').inputValue(),await p.evaluate(()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})));
await p.locator('#sentDateClear').click();

// Schema v2 separates candidate dispositions, registration history and READY.
await p.evaluate(()=>{window.fixtureBackup=targetsMap;targetsMap={_search_db_stats:{schema_version:2,total_candidates:100,discovered_count:10,review_count:20,rejected_count:30,error_count:5,duplicate_count:15,registered_count:20,ready_count:4}};setMainTab('SEARCH_DB');});
assert.deepEqual(await p.locator('.prospect-card strong').allTextContents(),['100','10','20','30','5','15','20','4']);
assert((await p.locator('#prospectSummary').textContent()).includes('검색 후보 대비 20.0%'));
await p.evaluate(()=>{targetsMap={_search_db_stats:{total_candidates:0,verified_count:2}};renderTable();});
const legacy=await p.locator('#prospectSummary').textContent();assert(legacy.includes('0.0%'));assert(!/NaN|Infinity/.test(legacy));assert((await p.locator('#resultSummary').textContent()).includes('구버전'));
// Real READY rows take precedence over a stale stats snapshot.
await p.evaluate(()=>{targetsMap={a:{token:'a',status:'READY'},_search_db_stats:{schema_version:2,total_candidates:1,ready_count:5}};renderTable();});
assert.equal(await p.locator('.prospect-card strong').last().textContent(),'1');
// Channel filters and details retain inbound history; synthetic events stay local.
await p.evaluate(()=>{targetsMap=window.fixtureBackup;liveEvents=[{ref:'inbound_fixture',event:'visit',timestamp:Date.now(),event_id:'fixture-visit',channel_type:'PSEO',channel_name:'수원 병원',region:'수원',industry:'병원'},{ref:'inbound_fixture',event:'kakao_click',timestamp:Date.now(),event_id:'fixture-hot',channel_type:'PSEO'}];updateKPIs();setMainTab('INBOUND');});
await p.locator('#reactionFilter').selectOption('PSEO');assert.equal(await p.locator('#mobileCardsContainer .target-card').count(),1);
await p.locator('#mobileCardsContainer [data-detail-token]').click();assert((await p.locator('#detailBody').textContent()).includes('카카오톡 상담 클릭'));await p.keyboard.press('Escape');
// Per-visit sources/pricing remain separate from customer attribution, including legacy history.
await p.evaluate(()=>{targetsMap={customer:{token:'customer',company:'방문 프로필',status:'SENT'}};liveEvents=[
{ref:'customer',event:'visit',timestamp:1000000000001,meta:{}},
{ref:'customer',event:'visit',timestamp:1000000000002,pricing_tier:'OUTBOUND_VIP',meta:{visit_id:'new',arrival_source:'검색: www.google.com',attribution_basis:'이전 제안 방문 이력'}},
{ref:'customer',event:'kakao_click',timestamp:1000000000003,meta:{visit_id:'new'}},
{ref:'unknown',event:'visit',timestamp:1000000000004,meta:{visit_id:'other'}}];openTargetDetail('customer');});
assert.equal(await p.locator('.visit-cards li').count(),2);
const profile=await p.locator('.customer-visits').innerText();
for(const text of ['검색: www.google.com','제휴가 · 50 / 280 / 360','이전 제안 방문 이력','상담 버튼 클릭 있음','과거 기록 · 유입 경로 미분리'])assert(profile.includes(text),text);
for(const width of [320,390]){await p.setViewportSize({width,height:844});assert(await p.locator('#targetDetail').evaluate(el=>el.scrollWidth<=el.clientWidth));}
await p.keyboard.press('Escape');
for(const width of [320,390,768,1024,1440]){await p.setViewportSize({width,height:900});for(const tab of ['SENT','READY','SEARCH_DB','INBOUND']){await p.evaluate(t=>setMainTab(t),tab);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width} ${tab}`);}}
await p.evaluate(()=>{liveEvents=[];saveStoredEvents();return fetchLiveTelemetry();});
assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.equal(await p.evaluate(()=>typeof purgeTestTelemetry),'undefined');console.log('PASS',sent,'sent rows, desktop/mobile/filters/details/new tabs/attribution/no writes');await b.close();})().catch(error=>{console.error(error);process.exit(1);});
