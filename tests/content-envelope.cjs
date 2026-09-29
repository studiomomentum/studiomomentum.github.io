const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let routed=0;
const sandbox={ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)})},adminRoute_:r=>{routed++;return {ok:false,error:'UNAUTHORIZED'};},LockService:{getScriptLock:()=>{throw Error('Admin request entered telemetry');}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('server/apps-script/Code.gs','utf8'),sandbox);
const request={route:'momentum_admin',action:'content.worker.complete',outputs:{naver:{body:'한'.repeat(15000)},tistory:{body:'글'.repeat(15000)},threads:{body:'단문'}}};
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify(request)}}).error,'UNAUTHORIZED');assert.equal(routed,1);
request.outputs.naver.body='한'.repeat(180000);
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify(request)}}).error,'REQUEST_TOO_LARGE');assert.equal(routed,1);
console.log('Long Korean drafts reach authenticated relay; oversized UTF-8 rejected before telemetry PASS');
