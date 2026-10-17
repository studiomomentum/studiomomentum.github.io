import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from './browser.mjs';
import {planDay,reviewScheduledArticles,writingContext,autopilotConfigFile} from './autopilot.mjs';
import {generate,loadPromptReferences} from './generator.mjs';
import {performanceSummary,seoulDate,platforms,checkScheduledArticle} from './autopilot-policy.mjs';
import {collectViewMetrics} from './view-metrics.mjs';
import {writeDurableJson} from './durable-json.mjs';
async function read(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
const command=process.argv[2]||'status';
const config=await read(autopilotConfigFile,{});
if(command==='status'){
  const state=await read(config.stateFile||path.join(root,'autopilot-state.json'),{});
  console.log(JSON.stringify({enabled:config.enabled||false,timezone:config.timezone,hours:config.hours,startAt:config.startAt,lastSuccessAt:state.lastSuccessAt,days:state.days,feedback:state.feedback},null,2));
}else if(['preview','metrics'].includes(command)){
  const admin=await read(config.adminFile||'/srv/storage/ssd240gb/PD/02_DB/비공개설정/momentum/admin-session.json');
  const response=await fetch(admin.url,{method:'POST',body:JSON.stringify({route:'momentum_admin',session:admin.session,action:'content.get'}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!data.ok)throw Error(data.error);
  const view=data.result;
  if(command==='metrics'){
    const posts=platforms.flatMap(platform=>view.deliveries.filter(j=>j.platform===platform&&j.kind==='publish'&&j.state==='complete'&&j.url).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10));
    const samples=await collectViewMetrics(posts,await read(path.join(root,'browser-settings.json')));
    const metrics={lastAttemptAt:Date.now(),samples};await writeDurableJson(config.metricsFile||path.join(root,'autopilot-metrics.json'),metrics);
    console.log(samples.map(s=>({platform:s.platform,url:s.url,status:s.status,views:s.views,error:s.error})));
  }else{
    const refs=loadPromptReferences(platforms);if(refs.pd.generation!=='G17')throw Error('AUTOPILOT_G17_REQUIRED');
    const metrics=await read(config.metricsFile||path.join(root,'autopilot-metrics.json'),{samples:[]});
    const state=await read(config.stateFile||path.join(root,'autopilot-state.json'),{days:{}});
    const feedback=performanceSummary(metrics,state);
    const plan=await planDay(view,feedback,seoulDate(Date.now()));
    await writeDurableJson(path.join(root,'autopilot-preview.json'),{stage:'planned',plan,feedback});console.log('plan saved');
    const topic=plan.topics[0],articles=await generate(topic,platforms,{writingContext:writingContext({topic,feedback})});
    await writeDurableJson(path.join(root,'autopilot-preview.json'),{stage:'generated',plan,feedback,articles});console.log('three articles generated');
    for(const p of platforms)checkScheduledArticle(p,articles[p]);
    const review=await reviewScheduledArticles(topic,articles);
    await writeDurableJson(path.join(root,'autopilot-preview.json'),{stage:'reviewed',generation:'G17',plan,feedback,articles,review});
    console.log(JSON.stringify({review,lengths:Object.fromEntries(platforms.map(p=>[p,[...articles[p].body].length]))}));
    if(!review.approved)process.exitCode=1;
  }
}else throw Error('COMMAND_INVALID');
