/* Private content store. Only called after adminSession_ succeeds. */
function contentDefault_() {
  return {schema:1,revision:0,topics:[],articles:{},jobs:[],deliveries:[],workerSeenAt:0};
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
  return {keywordRefreshes:['naver','datalab','vidiq'].map(source=>(db.keywordRefreshes||[]).filter(j=>j.source===source).map(j=>({id:j.id,source:j.source,state:j.state,createdAt:j.createdAt,completedAt:j.completedAt||null,results:j.results||[]})).at(-1)).filter(Boolean),keywordBoard:(db.keywordBoards||[]).at(-1)||null,deliveries:(db.deliveries||[]).map(j=>({id:j.id,docId:j.docId,platform:j.platform,target:j.platform==='naver'?(j.target||'jungkkuckma'):null,version:j.version,kind:j.kind,state:j.state,createdAt:j.createdAt,error:j.error||null,url:j.url||null})),revision:db.revision,topics:db.topics,articles:db.articles,jobs:db.jobs.map(j=>({id:j.id,topicId:j.topicId,platforms:contentPlatforms_(j),state:j.state,createdAt:j.createdAt,error:j.error||null})),workerSeenAt:db.workerSeenAt};
}
function contentPlatforms_(job) {return job.platforms||['naver','tistory','threads'];}
function contentRoute_(r) {
  return adminLock_(()=>{
    const file=contentFile_(),db=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    if(db.schema!==1||!Array.isArray(db.topics)||!Array.isArray(db.jobs)||!db.articles)throw Error('CONTENT_STORE_INVALID');
    if(!db.deliveries)db.deliveries=[];if(!Array.isArray(db.deliveries))throw Error('CONTENT_STORE_INVALID');
    const now=Date.now();let result,changed=false;
    switch(r.action){
      case 'content.get': return contentView_(db);
      case 'content.keywords.refresh': {
        if(!['naver','datalab','vidiq'].includes(r.source))throw Error('CONTENT_INVALID');
        if(!db.keywordBoards?.length)throw Error('CONTENT_NOT_FOUND');
        if(!db.keywordRefreshes)db.keywordRefreshes=[];
        if(db.keywordRefreshes.some(j=>j.source===r.source&&['queued','running'].includes(j.state)))return contentView_(db);
        db.keywordRefreshes.push({id:Utilities.getUuid(),state:'queued',createdAt:now,source:r.source});
        changed=true;break;
      }
      case 'content.keywords.claim': {
        const requestId=contentId_(r.requestId);db.workerSeenAt=now;changed=true;
        const jobs=db.keywordRefreshes||(db.keywordRefreshes=[]);
        let job=jobs.find(j=>j.requestId===requestId&&j.state==='running');
        if(!job&&jobs.some(j=>j.state==='running')){result={job:null};break;}
        if(!job){job=jobs.find(j=>j.state==='queued');if(job){job.state='running';job.requestId=requestId;job.claim=Utilities.getUuid();job.startedAt=now;job.board=db.keywordBoards.at(-1);}}
        result={job:job?{id:job.id,claim:job.claim,source:job.source,board:job.board}:null};break;
      }
      case 'content.keywords.finish': {
        const job=(db.keywordRefreshes||[]).find(j=>j.id===r.jobId&&j.claim===r.claim);if(!job)throw Error('CONTENT_CONFLICT');
        if(['complete','partial','failed'].includes(job.state))return {completed:true};if(job.state!=='running')throw Error('CONTENT_CONFLICT');
        if(!Array.isArray(r.results)||r.results.length!==1)throw Error('CONTENT_INVALID');
        const ids=new Set();let board=JSON.parse(JSON.stringify(db.keywordBoards.at(-1))),success=0;
        const statuses=r.results.map(part=>{
          if(part.id!==job.source||ids.has(part.id)||!['complete','failed'].includes(part.state))throw Error('CONTENT_INVALID');ids.add(part.id);
          if(part.state==='complete'){
            if(part.group?.id!==part.id||!Array.isArray(part.group.rows)||part.group.rows.some(row=>Date.parse(row.observedAt)<job.createdAt))throw Error('CONTENT_INVALID');
            board.groups=board.groups.map(g=>g.id===part.id?part.group:g);success++;return {id:part.id,state:'complete'};
          }
          return {id:part.id,state:'failed',error:contentText_(part.error,100)};
        });
        if(success){board.id=Utilities.getUuid();board.observedAt=new Date(now).toISOString();board=contentKeywordBoard_(board);db.keywordBoards.push(board);}
        job.results=statuses;job.state=success===1?'complete':'failed';job.completedAt=now;delete job.board;changed=true;result={completed:true};break;
      }
      case 'content.keywords.save': {
        const board=contentKeywordBoard_(r.board);
        if(!db.keywordBoards)db.keywordBoards=[];
        if(!Array.isArray(db.keywordBoards))throw Error('CONTENT_STORE_INVALID');
        if(db.keywordBoards.some(b=>b.id===board.id))return {saved:true};
        db.keywordBoards.push(board);changed=true;result={saved:true};break;
      }
      case 'content.topic.add': {
        const title=contentText_(r.title,180),question=contentText_(r.question,1000),evidence=contentText_(r.evidence,10000);
        if(db.topics.some(t=>t.title.replace(/\s/g,'')===title.replace(/\s/g,'')))throw Error('CONTENT_DUPLICATE');
        db.topics.push({id:Utilities.getUuid(),title,question,evidence,intent:contentText_(r.intent,60),createdAt:now,state:'unused',searchVolume:null});changed=true;break;
      }
      case 'content.generate': {
        const topic=contentTopic_(db,contentId_(r.topicId));
        if(db.deliveries.some(j=>j.topicId===topic.id&&['queued','running','unknown'].includes(j.state)))throw Error('CONTENT_BUSY');
        if(db.jobs.some(j=>j.topicId===topic.id&&['queued','running'].includes(j.state)))throw Error('CONTENT_BUSY');
        if(db.jobs.some(j=>j.topicId===topic.id&&j.state==='failed'))throw Error('CONTENT_RECONCILE_REQUIRED');
        const platforms=r.platform===undefined?['naver','tistory','threads']:[r.platform];
        if(platforms.some(p=>!['naver','tistory','threads'].includes(p)))throw Error('CONTENT_INVALID');
        const baseVersions={};platforms.forEach(p=>{baseVersions[p]=db.articles[topic.id+':'+p]?.versions.length||0;});
        db.jobs.push({id:Utilities.getUuid(),topicId:topic.id,state:'queued',createdAt:now,baseVersions,platforms});topic.state='producing';changed=true;break;
      }
      case 'content.retry': {
        const topic=contentTopic_(db,contentId_(r.topicId));
        const job=db.jobs.find(j=>j.topicId===topic.id&&j.state==='failed');
        if(!job||db.jobs.some(j=>j.topicId===topic.id&&['queued','running'].includes(j.state)))throw Error('CONTENT_CONFLICT');
        job.state='queued';job.error=null;job.claim=null;job.workerRequestId=null;
        contentPlatforms_(job).forEach(p=>{job.baseVersions[p]=db.articles[topic.id+':'+p]?.versions.length||0;});changed=true;break;
      }
      case 'content.save': {
        const doc=contentDoc_(db,contentId_(r.id));contentVersion_(doc,r.version);
        if(db.deliveries.some(j=>j.docId===doc.id&&['queued','running','unknown'].includes(j.state)))throw Error('CONTENT_BUSY');
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
        if(previous){result={job:{id:previous.id,claim:previous.claim,platforms:contentPlatforms_(previous),topic:contentTopic_(db,previous.topicId)}};break;}
        // An interrupted generation is never silently assigned to a second worker.
        const active=db.jobs.find(j=>j.state==='running');
        if(active){result={job:null,activeJobId:active.id};break;}
        const job=db.jobs.find(j=>j.state==='queued');
        if(!job){result={job:null};break;}
        job.state='running';job.workerRequestId=requestId;job.claim=Utilities.getUuid();job.startedAt=now;
        result={job:{id:job.id,claim:job.claim,platforms:contentPlatforms_(job),topic:contentTopic_(db,job.topicId)}};break;
      }
      case 'content.worker.complete': {
        const job=db.jobs.find(j=>j.id===r.jobId);
        if(!job||job.claim!==r.claim)throw Error('CONTENT_CONFLICT');
        if(job.state==='complete')return {completed:true};
        if(job.state!=='running')throw Error('CONTENT_CONFLICT');
        const outputs=r.outputs,platforms=contentPlatforms_(job);
        if(!outputs||Object.keys(outputs).sort().join(',')!==[...platforms].sort().join(','))throw Error('CONTENT_INVALID');
        const docs=platforms.map(platform=>{
          const id=job.topicId+':'+platform,old=db.articles[id];if((old?.versions.length||0)!==job.baseVersions[platform])throw Error('CONTENT_CONFLICT');
          return {id,topicId:job.topicId,platform,reviewedVersion:null,versions:[...(old?.versions||[]),{title:contentText_(outputs[platform].title,200),body:contentText_(outputs[platform].body,50000),createdAt:now,origin:'generated'}]};
        });
        docs.forEach(d=>{db.articles[d.id]=d;});job.state='complete';job.completedAt=now;changed=true;result={completed:true};break;
      }
      case 'content.worker.fail': {
        const job=db.jobs.find(j=>j.id===r.jobId&&j.claim===r.claim&&j.state==='running');
        if(!job)throw Error('CONTENT_CONFLICT');job.state='failed';job.error='GENERATION_FAILED';changed=true;result={failed:true};break;
      }
            case 'content.delivery.request': {
        const doc=contentDoc_(db,contentId_(r.id));contentVersion_(doc,r.version);
        if(db.jobs.some(j=>j.topicId===doc.topicId&&['queued','running'].includes(j.state)))throw Error('CONTENT_BUSY');
        if(!['naver','tistory','threads'].includes(doc.platform))throw Error('CONTENT_PLATFORM_PAUSED');
        if(!['draft','publish'].includes(r.kind))throw Error('CONTENT_INVALID');
        if(r.kind==='publish'&&doc.reviewedVersion!==r.version)throw Error('CONTENT_REVIEW_REQUIRED');
        if(doc.platform==='threads'&&(Array.from(doc.versions.at(-1).body).length>500||/(https?:\/\/|www\.)/i.test(doc.versions.at(-1).body)))throw Error('CONTENT_INVALID');
        const same=db.deliveries.find(j=>j.docId===doc.id&&(doc.platform!=='naver'||j.target==='sot_momentum')&&j.kind===r.kind&&j.version===r.version&&['queued','running','complete','unknown'].includes(j.state));
        if(same)return contentView_(db);
        if(db.deliveries.some(j=>j.docId===doc.id&&(j.kind==='publish'&&['complete','unknown'].includes(j.state)||['queued','running'].includes(j.state))))throw Error('CONTENT_RECONCILE_REQUIRED');
        db.deliveries.push({id:Utilities.getUuid(),docId:doc.id,topicId:doc.topicId,platform:doc.platform,target:doc.platform==='naver'?'sot_momentum':null,version:r.version,kind:r.kind,state:'queued',createdAt:now,snapshot:doc.versions.at(-1)});changed=true;break;
      }
      case 'content.delivery.cancel': {
        const job=db.deliveries.find(j=>j.id===r.jobId);if(!job||job.state!=='queued')throw Error('CONTENT_CONFLICT');job.state='cancelled';changed=true;break;
      }
      case 'content.delivery.claim': {
        const requestId=contentId_(r.requestId);db.workerSeenAt=now;changed=true;
        let job=db.deliveries.find(j=>j.requestId===requestId&&j.state==='running');
        if(!job&&db.deliveries.some(j=>j.state==='running')){result={job:null};break;}
        if(!job){job=db.deliveries.find(j=>j.state==='queued');if(job){job.state='running';job.requestId=requestId;job.claim=Utilities.getUuid();job.startedAt=now;}}
        result={job:job||null};break;
      }
      case 'content.delivery.authorize': {
        const job=db.deliveries.find(j=>j.id===r.jobId&&j.claim===r.claim&&j.state==='running');if(!job)throw Error('CONTENT_CONFLICT');
        if(job.platform==='naver'&&job.target!=='sot_momentum')throw Error('WRONG_BLOG');
        const doc=contentDoc_(db,job.docId);contentVersion_(doc,job.version);
        if(job.kind==='publish'&&doc.reviewedVersion!==job.version)throw Error('CONTENT_REVIEW_REQUIRED');
        result={authorized:true};break;
      }
      case 'content.delivery.finish': {
        const job=db.deliveries.find(j=>j.id===r.jobId&&j.claim===r.claim);if(!job)throw Error('CONTENT_CONFLICT');
        if(['complete','failed','unknown'].includes(job.state)){
          const same=job.state===r.state&&(job.state==='complete'
            ? job.kind!=='publish'||job.url===contentText_(r.url,1000)
            : job.error===contentText_(r.error||'CHECK_REQUIRED',100));
          if(!same)throw Error('CONTENT_CONFLICT');
          return {completed:true};
        }
        if(job.state!=='running')throw Error('CONTENT_CONFLICT');
        if(!['complete','failed','unknown'].includes(r.state))throw Error('CONTENT_INVALID');
        if(r.state==='complete'&&job.kind==='publish'){
          const url=contentText_(r.url,1000);
          const valid=job.platform==='naver'?/^https:\/\/blog\.naver\.com\/sot_momentum\/\d+$/.test(url):job.platform==='tistory'?/^https:\/\/sotmomentum\.tistory\.com\/(?:\d+|entry\/[^?#]+)$/.test(url):/^https:\/\/www\.threads\.com\/@sot_momentum\/post\/[\w-]+$/.test(url);
          if(!valid)throw Error('CONTENT_INVALID');job.url=url;
        }
        job.state=r.state;job.error=r.state==='complete'?null:contentText_(r.error||'CHECK_REQUIRED',100);job.completedAt=now;changed=true;result={completed:true};break;
      }
      case 'content.delivery.resolve': {
        const job=db.deliveries.find(j=>j.id===r.jobId&&j.state==='unknown');if(!job)throw Error('CONTENT_CONFLICT');
        // Only an explicit operator reconciliation can release an ambiguous click.
        if(r.confirmed!==true)throw Error('CONTENT_INVALID');
        if(r.resolution==='posted'&&job.kind==='publish'){
          const url=contentText_(r.url,1000);const valid=job.platform==='naver'?/^https:\/\/blog\.naver\.com\/sot_momentum\/\d+$/.test(url):job.platform==='tistory'?/^https:\/\/sotmomentum\.tistory\.com\/(?:\d+|entry\/[^?#]+)$/.test(url):/^https:\/\/www\.threads\.com\/@sot_momentum\/post\/[\w-]+$/.test(url);
          if(!valid)throw Error('CONTENT_INVALID');job.state='complete';job.url=url;job.error=null;
        }else if(r.resolution==='not_posted'){job.state='failed';job.error='OPERATOR_CONFIRMED_NOT_POSTED';}
        else throw Error('CONTENT_INVALID');
        job.resolvedAt=now;changed=true;break;
      }
      default:throw Error('INVALID_REQUEST');
    }
    if(changed){db.revision++;const raw=JSON.stringify(db);if(raw.length>4000000)throw Error('CONTENT_STORE_FULL');file.setContent(raw);}
    return result||contentView_(db);
  });
}

function contentKeywordBoard_(input){
  if(!input||JSON.stringify(input).length>150000||!Array.isArray(input.groups)||input.groups.length!==3)throw Error('CONTENT_INVALID');
  const text=(v,n)=>contentText_(v,n),date=v=>{text(v,40);if(!Number.isFinite(Date.parse(v)))throw Error('CONTENT_INVALID');return v;};
  const ids=new Set();
  return {id:contentId_(input.id),observedAt:date(input.observedAt),groups:input.groups.map(group=>{
    if(!['naver','datalab','vidiq'].includes(group.id)||ids.has(group.id)||!Array.isArray(group.rows)||group.rows.length!==10)throw Error('CONTENT_INVALID');ids.add(group.id);
    const seen=new Set();return {id:group.id,title:text(group.title,100),basis:text(group.basis,1500),limitations:text(group.limitations,1500),rows:group.rows.map(row=>{
      const keyword=text(row.keyword,60),key=keyword.replace(/\s/g,'');if(seen.has(key))throw Error('CONTENT_DUPLICATE');seen.add(key);
      if(!Array.isArray(row.links)||!row.links.length||row.links.length>5)throw Error('CONTENT_INVALID');
      return {keyword,category:text(row.category,40),metric:text(row.metric,300),reason:text(row.reason,1200),question:text(row.question,1000),observedAt:date(row.observedAt),detail:text(row.detail,2000),links:row.links.map(link=>{
        const url=text(link.url,2000);if(!/^https:\/\/(?:search\.naver\.com|datalab\.naver\.com|(?:m\.)?blog\.naver\.com|[^/.]+\.tistory\.com|app\.vidiq\.com|vidiq\.com|www\.youtube\.com)\//.test(url))throw Error('CONTENT_INVALID');return {label:text(link.label,200),url};
      })};
    })};
  })};
}
