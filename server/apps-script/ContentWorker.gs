/* Dedicated worker identity: no admin settings, arbitrary articles or publication requests. */
function contentWorkerRegister_(){return adminLock_(()=>{
  const db=JSON.parse(contentFile_().getBlob().getDataAsString('UTF-8'));
  if([...(db.jobs||[]),...(db.deliveries||[]),...(db.keywordRefreshes||[])].some(j=>j.state==='running'))throw Error('CONTENT_BUSY');
  const token=Utilities.getUuid()+Utilities.getUuid();
  adminProps_().setProperty('CONTENT_WORKER_HASH',adminHash_(token));return {workerToken:token};
});}
function contentWorkerRoute_(request){
  try{
    const expected=adminProps_().getProperty('CONTENT_WORKER_HASH');
    if(!expected||typeof request.workerToken!=='string'||!adminEqual_(expected,adminHash_(request.workerToken)))throw Error('UNAUTHORIZED');
    const allowed=['content.worker.claim','content.worker.complete','content.worker.fail','content.delivery.claim','content.delivery.authorize','content.delivery.finish','content.keywords.claim','content.keywords.finish'];
    if(!allowed.includes(request.action))throw Error('CONTENT_WORKER_ACTION_FORBIDDEN');
    return {ok:true,result:contentRoute_(request)};
  }catch(e){return {ok:false,error:/^(UNAUTHORIZED|BUSY|CONTENT_[A-Z_]+)$/.test(e.message)?e.message:'CONTENT_WORKER_FAILED'};}
}
