/* Private content store. Only called after adminSession_ succeeds. */
function contentDefault_() {
  return {schema:1,revision:0,topics:[],articles:{},jobs:[],workerSeenAt:0};
}
function contentFile_() {
  const props=adminProps_(),id=props.getProperty('MOMENTUM_CONTENT_FILE_ID');
  if(id)return DriveApp.getFileById(id);
  const file=DriveApp.createFile('momentum-content-private-v1.json',JSON.stringify(contentDefault_()),'application/json');
  props.setProperty('MOMENTUM_CONTENT_FILE_ID',file.getId());return file;
}
function contentText_(value,max) {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('CONTENT_INVALID');
  return value.trim();
}
function contentId_(value) {return contentText_(value,100);}
function contentTopic_(db,id) {const t=db.topics.find(t=>t.id===id);if(!t)throw Error('CONTENT_NOT_FOUND');return t;}
function contentDoc_(db,id) {const d=db.articles[id];if(!d)throw Error('CONTENT_NOT_FOUND');return d;}
function contentVersion_(doc,version) {if(doc.versions.length!==version)throw Error('CONTENT_CONFLICT');}
function contentView_(db) {
  return {revision:db.revision,topics:db.topics,articles:db.articles,jobs:db.jobs.map(j=>({id:j.id,topicId:j.topicId,state:j.state,createdAt:j.createdAt,error:j.error||null})),workerSeenAt:db.workerSeenAt};
}
function contentRoute_(r) {
  return adminLock_(()=>{
    const file=contentFile_(),db=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    if(db.schema!==1||!Array.isArray(db.topics)||!Array.isArray(db.jobs)||!db.articles)throw Error('CONTENT_STORE_INVALID');
    const now=Date.now();let result,changed=false;
    switch(r.action){
      case 'content.get': return contentView_(db);
      case 'content.topic.add': {
        const title=contentText_(r.title,180),question=contentText_(r.question,1000),evidence=contentText_(r.evidence,10000);
        if(db.topics.some(t=>t.title.replace(/\s/g,'')===title.replace(/\s/g,'')))throw Error('CONTENT_DUPLICATE');
        db.topics.push({id:Utilities.getUuid(),title,question,evidence,intent:contentText_(r.intent,60),createdAt:now,state:'unused',searchVolume:null});changed=true;break;
      }
      case 'content.generate': {
        const topic=contentTopic_(db,contentId_(r.topicId));
        if(db.jobs.some(j=>j.topicId===topic.id&&['queued','running'].includes(j.state)))throw Error('CONTENT_BUSY');
        if(db.jobs.some(j=>j.topicId===topic.id&&j.state==='failed'))throw Error('CONTENT_RECONCILE_REQUIRED');
        const baseVersions={};['naver','tistory','threads'].forEach(p=>{baseVersions[p]=db.articles[topic.id+':'+p]?.versions.length||0;});
        db.jobs.push({id:Utilities.getUuid(),topicId:topic.id,state:'queued',createdAt:now,baseVersions});topic.state='producing';changed=true;break;
      }
      case 'content.retry': {
        const topic=contentTopic_(db,contentId_(r.topicId));
        const job=db.jobs.find(j=>j.topicId===topic.id&&j.state==='failed');
        if(!job||db.jobs.some(j=>j.topicId===topic.id&&['queued','running'].includes(j.state)))throw Error('CONTENT_CONFLICT');
        job.state='queued';job.error=null;job.claim=null;job.workerRequestId=null;
        ['naver','tistory','threads'].forEach(p=>{job.baseVersions[p]=db.articles[topic.id+':'+p]?.versions.length||0;});changed=true;break;
      }
      case 'content.save': {
        const doc=contentDoc_(db,contentId_(r.id));contentVersion_(doc,r.version);
        const title=contentText_(r.title,200),body=contentText_(r.body,50000);
        const last=doc.versions[doc.versions.length-1];
        if(last.title!==title||last.body!==body){doc.versions.push({title,body,createdAt:now,origin:'user'});doc.reviewedVersion=null;changed=true;}break;
      }
      case 'content.review': {
        const doc=contentDoc_(db,contentId_(r.id));contentVersion_(doc,r.version);doc.reviewedVersion=r.version;changed=true;break;
      }
      case 'content.worker.claim': {
        const requestId=contentId_(r.requestId);
        db.workerSeenAt=now;changed=true;
        const previous=db.jobs.find(j=>j.workerRequestId===requestId&&j.state==='running');
        if(previous){result={job:{id:previous.id,claim:previous.claim,topic:contentTopic_(db,previous.topicId)}};break;}
        // An interrupted generation is never silently assigned to a second worker.
        const active=db.jobs.find(j=>j.state==='running');
        if(active){result={job:null,activeJobId:active.id};break;}
        const job=db.jobs.find(j=>j.state==='queued');
        if(!job){result={job:null};break;}
        job.state='running';job.workerRequestId=requestId;job.claim=Utilities.getUuid();job.startedAt=now;
        result={job:{id:job.id,claim:job.claim,topic:contentTopic_(db,job.topicId)}};break;
      }
      case 'content.worker.complete': {
        const job=db.jobs.find(j=>j.id===r.jobId);
        if(!job||job.claim!==r.claim)throw Error('CONTENT_CONFLICT');
        if(job.state==='complete')return {completed:true};
        if(job.state!=='running')throw Error('CONTENT_CONFLICT');
        const outputs=r.outputs;
        if(!outputs||Object.keys(outputs).sort().join(',')!=='naver,threads,tistory')throw Error('CONTENT_INVALID');
        const docs=['naver','tistory','threads'].map(platform=>{
          const id=job.topicId+':'+platform,old=db.articles[id];if((old?.versions.length||0)!==job.baseVersions[platform])throw Error('CONTENT_CONFLICT');
          return {id,topicId:job.topicId,platform,reviewedVersion:null,versions:[...(old?.versions||[]),{title:contentText_(outputs[platform].title,200),body:contentText_(outputs[platform].body,50000),createdAt:now,origin:'generated'}]};
        });
        docs.forEach(d=>{db.articles[d.id]=d;});job.state='complete';job.completedAt=now;changed=true;result={completed:true};break;
      }
      case 'content.worker.fail': {
        const job=db.jobs.find(j=>j.id===r.jobId&&j.claim===r.claim&&j.state==='running');
        if(!job)throw Error('CONTENT_CONFLICT');job.state='failed';job.error='GENERATION_FAILED';changed=true;result={failed:true};break;
      }
      default:throw Error('INVALID_REQUEST');
    }
    if(changed){db.revision++;const raw=JSON.stringify(db);if(raw.length>4000000)throw Error('CONTENT_STORE_FULL');file.setContent(raw);}
    return result||contentView_(db);
  });
}
