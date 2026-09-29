const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let raw,props={};const file={getId:()=> 'fixture',getBlob:()=>({getDataAsString:()=>raw}),setContent:s=>raw=s};
const ctx={Date,JSON,Utilities:{getUuid:()=>crypto.randomUUID()},DriveApp:{createFile:(n,s)=>{raw=s;return file},getFileById:()=>file},adminProps_:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v}),adminLock_:f=>f()};vm.createContext(ctx);vm.runInContext(fs.readFileSync('server/apps-script/ContentStore.gs','utf8'),ctx);
const call=(action,p={})=>JSON.parse(JSON.stringify(ctx.contentRoute_({action,...p})));
const topicId=call('content.topic.add',{title:'독립 생성 검증',question:'질문',intent:'검증',evidence:'fixture'}).topics[0].id;
const full=Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:p,body:p+' 원본'}]));
call('content.generate',{topicId});let job=call('content.worker.claim',{requestId:crypto.randomUUID()}).job;call('content.worker.complete',{jobId:job.id,claim:job.claim,outputs:full});
for(const platform of ['naver','tistory','threads']){
 for(const p of ['naver','tistory','threads']){const d=call('content.get').articles[topicId+':'+p];call('content.review',{id:d.id,version:d.versions.length});}
 const before=call('content.get');
 call('content.generate',{topicId,platform});job=call('content.worker.claim',{requestId:crypto.randomUUID()}).job;
 assert.deepEqual(job.platforms,[platform]);assert.throws(()=>call('content.worker.complete',{jobId:job.id,claim:job.claim,outputs:full}),/CONTENT_INVALID/);
 call('content.worker.complete',{jobId:job.id,claim:job.claim,outputs:{[platform]:{title:platform+' 새 제목',body:'새 본문'}}});
 const after=call('content.get');for(const p of ['naver','tistory','threads']){const id=topicId+':'+p;if(p!==platform)assert.deepEqual(after.articles[id],before.articles[id]);else{assert.equal(after.articles[id].versions.length,before.articles[id].versions.length+1);assert.deepEqual(after.articles[id].versions.slice(0,-1),before.articles[id].versions);assert.equal(after.articles[id].reviewedVersion,null);}}
 assert.deepEqual(after.deliveries,before.deliveries);
}
assert.throws(()=>call('content.generate',{topicId,platform:'youtube'}),/CONTENT_INVALID/);
call('content.generate',{topicId,platform:'tistory'});job=call('content.worker.claim',{requestId:crypto.randomUUID()}).job;
let n=call('content.get').articles[topicId+':naver'];call('content.save',{id:n.id,version:n.versions.length,title:'별도 편집',body:'보존'});
call('content.worker.fail',{jobId:job.id,claim:job.claim});call('content.retry',{topicId});job=call('content.worker.claim',{requestId:crypto.randomUUID()}).job;assert.deepEqual(job.platforms,['tistory']);
const t=call('content.get').articles[topicId+':tistory'];call('content.save',{id:t.id,version:t.versions.length,title:'사용자 편집',body:'덮어쓰기 금지'});
assert.throws(()=>call('content.worker.complete',{jobId:job.id,claim:job.claim,outputs:{tistory:{title:'충돌',body:'충돌'}}}),/CONTENT_CONFLICT/);
assert.equal(call('content.get').articles[n.id].versions.at(-1).title,'별도 편집');
console.log('Per-platform versions, other reviews/history preserved, retry scope, invalid target and edit conflicts PASS');
