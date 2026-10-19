const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const collector=fs.readFileSync('assets/momentum-collector.js','utf8'),runtime=fs.readFileSync('assets/momentum-runtime.js','utf8');
const storage=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
function environment({local=storage(),tab=storage(),referrer='',pathname='/suwon-hospital.html',hidden=false}={}){
 let now=0,serial=0;const timers=[],docEvents={},winEvents={},requests=[],saved=[];let offline=false,readback=true;
 const document={focused:true,hasFocus(){return this.focused},referrer,visibilityState:hidden?'hidden':'visible',addEventListener:(n,f)=>(docEvents[n]??=[]).push(f)};
 const window={crypto:{randomUUID:()=>pathname.replace(/\W/g,'')+'-'+(++serial)},location:{search:'',hash:'',hostname:'momentum.local',pathname},localStorage:local,sessionStorage:tab,
 setTimeout:f=>{timers.push(f);return timers.length},clearTimeout(){},setInterval:f=>{window.tick=f;return 1},clearInterval(){},addEventListener:(n,f)=>(winEvents[n]??=[]).push(f)};
 window.fetch=async(url,options={})=>{requests.push({url,options});if(offline)throw Error('offline');if(url.includes('ntfy'))return {ok:true};if(options.method==='POST'){if(readback)saved.push(...JSON.parse(options.body));return {ok:false,type:'opaque'};}return {ok:true,json:async()=>readback?saved:[]};};
 const c={window,document,performance:{now:()=>now},navigator:{sendBeacon:()=>true},URL,URLSearchParams,crypto:window.crypto,fetch:window.fetch};vm.createContext(c);vm.runInContext(collector,c);vm.runInContext(runtime,c);
 return {window,document,local,tab,requests,saved,M:window.Momentum,C:window.MomentumCollector,advance:ms=>{now+=ms},emit:(n,props={})=>{for(const f of (docEvents[n]||[]))f(props);for(const f of (winEvents[n]||[]))f(props);},setOffline:v=>offline=v,setReadback:v=>readback=v};
}
(async()=>{
 const e=environment({referrer:'https://www.google.com/search?q=video'});
 await e.M.sendTelemetry({ref:'pseo_suwon_hospital_abc',channel_type:'PSEO',event:'visit',region:'수원',industry:'병원'},'fixture','https://gas.test');
 assert.equal(e.C.status().pending,1);await e.C.flush(true);assert.equal(e.C.status().pending,0);
 const first=e.saved[0];assert.equal(first.meta.schema_version,2);assert(first.meta.session_id&&first.meta.visitor_id&&first.meta.visit_id);
 const main=environment({local:e.local,tab:e.tab,referrer:'https://momentum.local/suwon-hospital.html',pathname:'/'});
 await main.M.sendTelemetry({ref:'inbound_direct_xyz',channel_type:'DIRECT',event:'visit'},'fixture','https://gas.test');await main.C.flush(true);
 const second=main.saved[0];assert.equal(second.ref,first.ref);assert.equal(second.meta.session_id,first.meta.session_id);assert.equal(second.meta.visitor_id,first.meta.visitor_id);assert.notEqual(second.meta.visit_id,first.meta.visit_id);assert.equal(second.meta.entry_host,'www.google.com');assert.equal(second.pricing_tier,'INBOUND_PUBLIC');
 await main.M.sendTelemetry({ref:'inbound_direct_xyz',channel_type:'DIRECT',event:'kakao_click'},'fixture','https://gas.test');await main.C.flush(true);assert.equal(main.saved.at(-1).ref,first.ref);
 const vip=environment({local:e.local,tab:e.tab,pathname:'/vip'});await vip.M.sendTelemetry({ref:'existing_customer',channel_type:'OUTBOUND',pricing_tier:'OUTBOUND_VIP',event:'visit'},'fixture','https://gas.test');await vip.C.flush(true);assert.equal(vip.saved[0].meta.session_id,first.meta.session_id);assert.equal(vip.saved[0].ref,'existing_customer');assert.equal(vip.saved[0].pricing_tier,'OUTBOUND_VIP');
 const other=environment({local:e.local,pathname:'/'});await other.M.sendTelemetry({ref:'inbound_new',channel_type:'DIRECT',event:'visit'},'fixture','https://gas.test');await other.C.flush(true);assert.equal(other.saved[0].meta.visitor_id,first.meta.visitor_id);assert.notEqual(other.saved[0].meta.session_id,first.meta.session_id);
 // A persisted queue survives a reload, offline failures and an opaque POST/beacon response.
 const q=environment();q.setOffline(true);await q.M.sendTelemetry({ref:'inbound_queue',channel_type:'DIRECT',event:'visit'},'fixture','https://gas.test');await q.C.flush(true);assert.equal(q.C.status().pending,1);
 const reload=environment({local:q.local,tab:q.tab});reload.setReadback(false);await reload.C.flush(true);assert.equal(reload.C.status().pending,1);reload.emit('pagehide');assert.equal(reload.C.status().pending,1);
 reload.setReadback(true);await reload.C.flush(true);assert.equal(reload.C.status().pending,0);const retries=reload.requests.filter(r=>r.options.method==='POST'&&!r.url.includes('ntfy')).map(r=>JSON.parse(r.options.body)[0].event_id);assert.equal(new Set(retries).size,1);
 // Visible-time clock pauses in the background and resumes; final records are not one-shot.
 const clock=environment(),events=[];const tracker=clock.C.activeTracker((event,meta)=>events.push({event,meta}));clock.advance(11000);tracker.sample();assert(events.some(x=>x.event==='duration_10s'));
 clock.document.visibilityState='hidden';clock.emit('visibilitychange');clock.advance(600000);tracker.sample();assert.equal(tracker.seconds(),11);assert(!events.some(x=>x.event==='duration_30s'));
 clock.document.visibilityState='visible';clock.emit('visibilitychange');clock.advance(20000);tracker.sample();assert.equal(tracker.seconds(),31);clock.document.focused=false;clock.emit('blur');clock.advance(120000);tracker.sample();assert.equal(tracker.seconds(),31);clock.document.focused=true;clock.emit('focus');clock.advance(5000);assert.equal(tracker.seconds(),36);clock.emit('pagehide');assert.equal(events.at(-1).meta.active_duration,36);assert.equal(events.at(-1).meta.reason,'pagehide');assert(events.filter(x=>x.event==='leave').length>=2);
 const analytics=e.M.mergeEvents([first,second,{...second,event_id:'view-copy',event:'view'},...main.saved]);const totals=e.M.trafficSummary(analytics);assert.equal(totals.pageViews,2);assert.equal(e.M.aggregateStats({},analytics)[first.ref].visitCount,2);assert.equal(totals.sessions,1);assert.equal(totals.browserVisitors,1);
 const timed=[{...first,event:'engagement',event_id:'time1',meta:{...first.meta,measurement:'visible_time_v2',active_duration:11}},{...first,event:'leave',event_id:'time2',meta:{...first.meta,measurement:'visible_time_v2',active_duration:31}},{...second,event:'leave',event_id:'time3',meta:{...second.meta,measurement:'visible_time_v2',active_duration:7}}];
 assert.equal(e.M.aggregateStats({},timed)[first.ref].activeStaySec,38);
 assert(e.M.aggregateStats({},[{...second,event:'pay_and_kakao_connect',event_id:'handoff'}])[first.ref].hot);
 const blocked=environment();blocked.window.localStorage={get length(){return 0},getItem(){return null},setItem(){throw Error('quota')},removeItem(){}};await blocked.M.sendTelemetry({ref:'inbound_blocked',event:'visit'},'fixture','https://gas.test');assert.equal(blocked.C.status().storageError,true);assert.equal(blocked.C.status().pending,1);
 const admin=environment();await admin.M.sendTelemetry({ref:'test',event:'visit'},'fixture','https://gas.test');assert.equal(admin.C.status().pending,0);
 console.log('PASS: persisted readback queue, offline/reload/beacon/retry identity, cross-page sessions and visitor identity, active visible time, checkpoints, pageview deduplication, consultation attribution, admin exclusion');
})().catch(e=>{console.error(e);process.exitCode=1;});
