const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const urls=[];let beaconCalls=0;
 const sandbox={URL,location:{href:'https://studiomomentum.github.io/'},navigator:{sendBeacon:()=>{beaconCalls++;return true;}},window:{fetch:async url=>{urls.push(url);return {ok:true}}}};
 await require('./isolate-telemetry.cjs')({addInitScript:async fn=>vm.runInNewContext('('+fn.toString()+')()',sandbox)});
 await sandbox.window.fetch('https://ntfy.sh/sm_events_2026_x89a',{method:'POST'});
 await sandbox.window.fetch('https://script.google.com/macros/s/fixture/exec',{method:'POST'});
 assert.equal(new URL(urls[0]).hostname,'ntfy.telemetry.invalid');assert.equal(new URL(urls[1]).hostname,'gas.telemetry.invalid');
 assert.equal(sandbox.navigator.sendBeacon('https://ntfy.sh/production','payload'),false);assert.equal(beaconCalls,0);
 const code=fs.readFileSync('assets/momentum-runtime.js','utf8'),context={window:{},document:{addEventListener(){}}};vm.runInNewContext(code,context);
 const M=context.window.Momentum,ids=JSON.parse(code.match(/excludedTestSessions = new Set\((\[[^\n]+\])\)/)[1]);
 assert.equal(ids.length,9);
 const make=session=>({event:'visit',ref:'pseo_suwon_hospital_fixture',timestamp:Date.now(),meta:{session_id:session,schema_version:2,visit_id:session,visitor_id:session}});
 assert(M.isTestEvent(make(ids[0])));assert(!M.isTestEvent(make('unrelated-customer')));
 assert.equal(M.trafficSummary([make(ids[0]),make('unrelated-customer')]).pageViews,1);
 assert.equal(M.trafficSummary([make(ids[0]),make('unrelated-customer')]).sessions,1);
 console.log('PASS: production fetches redirected to reserved invalid hosts, teardown beacons disabled, confirmed test sessions excluded, unrelated customer retained');
})().catch(e=>{console.error(e);process.exitCode=1;});
