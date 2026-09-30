const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');let raw;const file={getId:()=> 'x',getBlob:()=>({getDataAsString:()=>raw}),setContent:s=>raw=s};
const ctx={Date,JSON,Utilities:{getUuid:()=>crypto.randomUUID()},DriveApp:{createFile:(_n,s)=>{raw=s;return file},getFileById:()=>file},adminProps_:()=>({getProperty:()=>raw?'x':null,setProperty:()=>{}}),adminLock_:f=>f()};vm.createContext(ctx);vm.runInContext(fs.readFileSync('server/apps-script/ContentStore.gs','utf8'),ctx);const call=(action,p={})=>JSON.parse(JSON.stringify(ctx.contentRoute_({action,...p})));
const topic=call('content.topic.add',{title:'test',question:'q',intent:'i',evidence:'e'}).topics[0];call('content.generate',{topicId:topic.id});const g=call('content.worker.claim',{requestId:'g'}).job;call('content.worker.complete',{jobId:g.id,claim:g.claim,outputs:Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:p,body:'본문'}]))});const id=topic.id+':tistory';
assert.throws(()=>call('content.delivery.request',{id,version:1,kind:'publish'}),/REVIEW_REQUIRED/);assert.throws(()=>call('content.delivery.request',{id:topic.id+':naver',version:1,kind:'publish'}),/REVIEW_REQUIRED/);
call('content.review',{id,version:1});call('content.delivery.request',{id,version:1,kind:'publish'});call('content.delivery.request',{id,version:1,kind:'publish'});assert.equal(call('content.get').deliveries.length,1);
assert.throws(()=>call('content.save',{id,version:1,title:'changed',body:'changed'}),/BUSY/);assert.throws(()=>call('content.generate',{topicId:topic.id}),/BUSY/);
const j=call('content.delivery.claim',{requestId:'worker'}).job;assert.equal(call('content.delivery.claim',{requestId:'worker'}).job.id,j.id);assert.equal(call('content.delivery.claim',{requestId:'other'}).job,null);
assert.throws(()=>call('content.delivery.authorize',{jobId:j.id,claim:'wrong'}),/CONFLICT/);assert(call('content.delivery.authorize',{jobId:j.id,claim:j.claim}).authorized);
assert.throws(()=>call('content.delivery.finish',{jobId:j.id,claim:j.claim,state:'complete',url:'https://evil.example/1'}),/INVALID/);
call('content.delivery.finish',{jobId:j.id,claim:j.claim,state:'unknown',error:'RESULT_UNKNOWN'});call('content.delivery.request',{id,version:1,kind:'publish'});assert.equal(call('content.get').deliveries.length,1);
assert.throws(()=>call('content.delivery.resolve',{jobId:j.id,resolution:'not_posted'}),/INVALID/);call('content.delivery.resolve',{jobId:j.id,resolution:'not_posted',confirmed:true});call('content.delivery.request',{id,version:1,kind:'publish'});
const retry=call('content.delivery.claim',{requestId:'retry'}).job;call('content.delivery.finish',{jobId:retry.id,claim:retry.claim,state:'complete',url:'https://sotmomentum.tistory.com/1'});assert(call('content.delivery.finish',{jobId:retry.id,claim:retry.claim,state:'complete',url:'https://sotmomentum.tistory.com/1'}).completed);
const state=call('content.get');assert(!JSON.stringify(state.deliveries).includes('snapshot'));assert(!JSON.stringify(state.deliveries).includes('claim'));assert.equal(state.deliveries.at(-1).url,'https://sotmomentum.tistory.com/1');
call('content.save',{id,version:1,title:'v2',body:'v2'});call('content.review',{id,version:2});assert.throws(()=>call('content.delivery.request',{id,version:2,kind:'publish'}),/RECONCILE/);
console.log('Delivery review gate, Naver review gate, snapshots, locks, duplicate claims, ambiguous recovery, URL checks PASS');

const tid=topic.id+':threads';call('content.review',{id:tid,version:1});
for(const outcome of ['failed','unknown']){
 call('content.delivery.request',{id:tid,version:1,kind:'publish'});
 const job=call('content.delivery.claim',{requestId:'terminal-'+outcome}).job;
 const payload={jobId:job.id,claim:job.claim,state:outcome,error:'BROWSER_PROFILE_IN_USE'};
 call('content.delivery.finish',payload);
 const revision=call('content.get').revision;
 assert(call('content.delivery.finish',payload).completed);
 assert.equal(call('content.get').revision,revision);
 assert.throws(()=>call('content.delivery.finish',{...payload,error:'DIFFERENT'}),/CONFLICT/);
 assert.throws(()=>call('content.delivery.finish',{...payload,state:'complete'}),/CONFLICT/);
 assert.throws(()=>call('content.delivery.finish',{...payload,claim:'wrong'}),/CONFLICT/);
}
console.log('Identical failed/unknown acknowledgments are idempotent; conflicting outcomes rejected PASS');

const nid=topic.id+':naver';
const legacy=JSON.parse(raw);legacy.deliveries.push({id:'legacy-naver',docId:nid,platform:'naver',version:1,kind:'draft',state:'complete'});raw=JSON.stringify(legacy);
assert.equal(call('content.get').deliveries.at(-1).target,'jungkkuckma');
call('content.delivery.request',{id:nid,version:1,kind:'draft'});
const nd=call('content.delivery.claim',{requestId:'naver-draft'}).job;
assert.equal(nd.platform,'naver');assert.equal(nd.target,'sot_momentum');assert.notEqual(nd.id,'legacy-naver');call('content.delivery.finish',{jobId:nd.id,claim:nd.claim,state:'complete'});
call('content.review',{id:nid,version:1});call('content.delivery.request',{id:nid,version:1,kind:'publish'});
const np=call('content.delivery.claim',{requestId:'naver-publish'}).job;
for(const url of ['https://blog.naver.com/other/123','https://www.threads.com/@sot_momentum/post/123'])assert.throws(()=>call('content.delivery.finish',{jobId:np.id,claim:np.claim,state:'complete',url}),/INVALID/);
call('content.delivery.finish',{jobId:np.id,claim:np.claim,state:'complete',url:'https://blog.naver.com/sot_momentum/123'});
assert.equal(call('content.get').deliveries.at(-1).url,'https://blog.naver.com/sot_momentum/123');
console.log('Naver draft queue, review requirement and destination URL checks PASS');
