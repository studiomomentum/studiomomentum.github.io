import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {dueSlots,performanceSummary,checkScheduledArticle,validatePlan} from '../autopilot-policy.mjs';
import {parseViews,threadViewRows} from '../view-metrics.mjs';

test('Korean daily slots prepare 30 minutes early and never backfill expired or pre-install slots',()=>{
 const config={hours:[10,18],startAt:Date.parse('2026-10-17T17:00:00+09:00')};
 assert.equal(dueSlots(config,Date.parse('2026-10-17T17:29:59+09:00')).length,0);
 assert.deepEqual(dueSlots(config,Date.parse('2026-10-17T17:30:00+09:00')).map(s=>s.hour),[18]);
 assert.equal(dueSlots(config,Date.parse('2026-10-17T20:00:01+09:00')).length,0);
 assert.deepEqual(dueSlots(config,Date.parse('2026-10-18T09:30:00+09:00')).map(s=>s.key),['2026-10-18-10']);
});
test('view parsing distinguishes a verified zero from unavailable; Threads matches exact post IDs',()=>{
 assert.equal(parseViews('0'),0);assert.equal(parseViews('1,234'),1234);assert.equal(parseViews('1.2K'),1200);assert.equal(parseViews('—'),null);
 const rows=threadViewRows([{url:'https://www.threads.com/insights/post/ABC?without_navigation=false',text:'본문\n3\n49\nViews'},{url:'https://www.threads.com/insights/post/DEF',text:'본문\nViews'}]);
 assert.deepEqual(rows,[{url:'https://www.threads.com/@sot_momentum/post/ABC',views:49,raw:'49'}]);
});
test('feedback compares one near-24h sample per article within each platform, with at least three articles',()=>{
 const state={days:{x:{slots:{}}}},samples=[];
 for(let i=0;i<3;i++){
  const url='https://example.com/'+i;state.days.x.slots[i]={topic:{formats:{naver:'비교형'}},posts:{naver:{url,publishedAt:1}}};
  samples.push({platform:'naver',url,observedAt:1+24*3600000,status:'ok',views:10+i});
  samples.push({platform:'naver',url,observedAt:1+26*3600000,status:'ok',views:99});
 }
 samples.push({platform:'tistory',url:'x',observedAt:86400000,status:'ok',views:99999});
 const summary=performanceSummary({samples},state);
 assert.equal(summary[0].formats.find(x=>x.format==='비교형').medianViews,11);
 assert.equal(summary[0].formats.find(x=>x.format==='비교형').count,3);
 assert(summary[1].formats.every(x=>x.medianViews===null));
 assert(performanceSummary({samples:samples.slice(0,2)},state)[0].formats.every(x=>x.medianViews===null));
});
test('scheduled public review rejects missing service link, oversize Threads, leaked prompts and invalid plans',()=>{
 assert.throws(()=>checkScheduledArticle('naver',{title:'제목',body:'가'.repeat(100)}),/REVIEW/);
 assert.throws(()=>checkScheduledArticle('threads',{title:'제목',body:'가'.repeat(501)}),/REVIEW/);
 assert.throws(()=>checkScheduledArticle('threads',{title:'제목',body:'가'.repeat(100)+' G17'}),/REVIEW/);
 assert.throws(()=>validatePlan({topics:[]}),/PLAN/);
});

test('scheduler persists planning, recovers lost topic response, and publishes each version only once',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'autopilot-e2e-'));
 const prev={home:process.env.MOMENTUM_BLOG_HOME,skill:process.env.MOMENTUM_PD_SKILL_DIR};
 // Modules in this process already imported browser.root; use a fresh subprocess for isolation.
 const {spawnSync}=await import('node:child_process');
 const script=`
 import fs from 'node:fs/promises';import assert from 'node:assert/strict';import path from 'node:path';
 const root=process.env.MOMENTUM_BLOG_HOME;
 const {autopilotOnce,scheduledDeliveryExpired}=await import(${JSON.stringify(new URL('../autopilot.mjs',import.meta.url).href)});
 const now=Date.now(),date=new Date(now+9*3600000).toISOString().slice(0,10),hour=18;
 const release=Date.parse(date+'T18:00:00+09:00');
 const config={enabled:true,timezone:'Asia/Seoul',hours:[10,18],startAt:release,adminFile:path.join(root,'admin.json'),stateFile:path.join(root,'state.json'),metricsFile:path.join(root,'metrics.json')};
 await fs.writeFile(path.join(root,'autopilot-config.json'),JSON.stringify(config));await fs.writeFile(config.adminFile,JSON.stringify({session:'test',persistent:true}));await fs.writeFile(config.metricsFile,JSON.stringify({samples:[],lastAttemptAt:release}));
 let calls=[],lost=true;const view={topics:[],articles:{},jobs:[],deliveries:[]};
 const topic=i=>({title:'새 질문'+i,theme:'전문직 브랜딩',question:'외주를 맡기기 전에 어떤 기준을 확인할까?',intent:'구매 검토',evidence:'일반적인 의뢰 판단. 실제 성과 없음.',formats:{naver:'비교형',tistory:'선택 가이드형',threads:'설명형'}});
 const rpc=async(c,a,p={})=>{calls.push(a);
  if(a==='content.topic.add'){view.topics.push({...p,id:'t'});if(lost){lost=false;throw Error('RELAY_CONNECTION');}}
  if(a==='content.generate')view.jobs.push({id:'g',topicId:'t',state:'queued'});
  if(a==='content.review')view.articles[p.id].reviewedVersion=p.version;
  if(a==='content.delivery.request')view.deliveries.push({docId:p.id,version:p.version,kind:'publish',state:'queued'});
  return structuredClone(view);
 };
 const deps={rpc,plan:async()=>({topics:[topic(1),topic(2)]}),review:async()=>({approved:true,reasons:[]}),collect:async()=>[]};
 await autopilotOnce({...deps,now:release-20*60000});
 let state=JSON.parse(await fs.readFile(config.stateFile));assert.equal(state.days[date].slots[18].state,'waiting');
 // A lost response is reconciled against server topics before retrying creation.
 state.days[date].slots[18].state='preparing';state.lastTickAt=0;await fs.writeFile(config.stateFile,JSON.stringify(state));
 await autopilotOnce({...deps,now:release-19*60000});assert.equal(calls.filter(a=>a==='content.topic.add').length,1);
 for(const platform of ['naver','tistory','threads'])view.articles['t:'+platform]={id:'t:'+platform,platform,versions:[{title:'제목',body:'판단 기준 설명 '.repeat(10)+(platform==='threads'?'':'https://studiomomentum.github.io/')}],reviewedVersion:null};
 view.jobs[0].state='complete';
 // Test publication gates with the injected clock controlling the release boundary.
 const OriginalDate=Date;globalThis.Date=class extends OriginalDate{static now(){return release;}};
 await autopilotOnce({...deps,now:release});
 await autopilotOnce({...deps,now:release+60001});
 assert.equal(calls.filter(a=>a==='content.delivery.request').length,3);
 assert(await scheduledDeliveryExpired({topicId:'t',platform:'naver',version:1},release+2*3600000+1));
 state=JSON.parse(await fs.readFile(config.stateFile));state.lastTickAt=0;state.days[date].slots[18].review={approved:false,reasons:['허위 사례']};state.days[date].slots[18].state='ready';
 await fs.writeFile(config.stateFile,JSON.stringify(state));view.deliveries=[];
 await autopilotOnce({...deps,now:release+120002});
 assert.equal(calls.filter(a=>a==='content.delivery.request').length,3);
 state=JSON.parse(await fs.readFile(config.stateFile));assert.equal(state.days[date].slots[18].state,'held');
 globalThis.Date=OriginalDate;console.log('idempotent schedule PASS');
 `;
 try{
  const skill=path.join(dir,'skill');await fs.mkdir(path.join(skill,'references'),{recursive:true});
  await fs.writeFile(path.join(skill,'SKILL.md'),'[현행 생성 프롬프트](references/codex-generation-G17.md)');
  await fs.writeFile(path.join(skill,'references/generation-ledger.md'),'현재 사용 세대: [G17](codex-generation-G17.md)');
  await fs.writeFile(path.join(skill,'references/codex-generation-G17.md'),'PROMPT_GENERATION = G17\n원칙');
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,MOMENTUM_BLOG_HOME:dir,MOMENTUM_PD_SKILL_DIR:skill},timeout:20000});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
