/* Secrets exist only in Script Properties. Never log requests, passwords or tokens. */
const ADMIN_RELAY_VERSION_ = 1;
const ADMIN_REPO_ = 'studiomomentum/momentum-cold-mailer';
const ADMIN_WORKFLOW_ = 'auto_prospect.yml';
const ADMIN_SEARCH_WORKFLOW_ = 'prospecting.yml';
function adminProps_() { return PropertiesService.getScriptProperties(); }
function adminHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(b => ('0'+(b&255).toString(16)).slice(-2)).join('');
}
function adminMac_(value) {
  const key=adminProps_().getProperty('ADMIN_SESSION_SECRET');
  if (!key) throw new Error('SERVER_NOT_CONFIGURED');
  return Utilities.computeHmacSha256Signature(String(value),key,Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
}
function adminEqual_(a,b) {
  a=String(a||'');b=String(b||'');let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function adminLock_(fn) {
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('BUSY');
  try{return fn();}finally{lock.releaseLock();}
}
function adminRead_(key, fallback) {const raw=adminProps_().getProperty(key);return raw?JSON.parse(raw):fallback;}
function adminWrite_(key,value) {adminProps_().setProperty(key,JSON.stringify(value));}
function adminLogin_(request) {
  return adminLock_(()=>{
    const now=Date.now(),props=adminProps_();
    let guard=adminRead_('ADMIN_LOGIN_GUARD',{start:now,count:0});
    if(now-guard.start>15*60*1000)guard={start:now,count:0};
    if(guard.count>=8)throw new Error('LOGIN_RATE_LIMIT');
    if(!props.getProperty('ADMIN_PASSWORD_CHECK')||!props.getProperty('MOMENTUM_GITHUB_TOKEN'))throw new Error('SERVER_NOT_CONFIGURED');
    guard.count++;adminWrite_('ADMIN_LOGIN_GUARD',guard);
    const password=typeof request.password==='string'?request.password:'';
    const valid=request.username==='admin'&&password.length>0&&password.length<=256&&adminEqual_(adminMac_('password:'+adminHash_(password)),props.getProperty('ADMIN_PASSWORD_CHECK'));
    if(!valid)throw new Error('INVALID_LOGIN');
    props.deleteProperty('ADMIN_LOGIN_GUARD');
    const expiresAt=now+(request.remember===true?7*24:8)*60*60*1000;
    const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'')+adminMac_(Utilities.getUuid()+':'+now);
    const sessions=adminRead_('ADMIN_SESSIONS',[]).filter(s=>s.expiresAt>now).slice(-9);
    sessions.push({hash:adminHash_(token),expiresAt:expiresAt});adminWrite_('ADMIN_SESSIONS',sessions);
    return {token:token,expiresAt:expiresAt};
  });
}
function adminSession_(token) {
  if(typeof token!=='string'||!/^[a-f0-9]{128}$/.test(token))throw new Error('UNAUTHORIZED');
  const hash=adminHash_(token),now=Date.now();
  const session=adminRead_('ADMIN_SESSIONS',[]).find(s=>s.expiresAt>now&&adminEqual_(s.hash,hash));
  if(!session)throw new Error('UNAUTHORIZED');return session;
}
function adminGithub_(path,method,body) {
  const token=adminProps_().getProperty('MOMENTUM_GITHUB_TOKEN');
  if(!token)throw new Error('SERVER_NOT_CONFIGURED');
  const options={method:method||'get',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},muteHttpExceptions:true,followRedirects:false};
  if(body){options.contentType='application/json';options.payload=JSON.stringify(body);}
  let response;try{response=UrlFetchApp.fetch('https://api.github.com/'+path,options);}catch(_){throw new Error('GITHUB_CONNECTION');}
  const code=response.getResponseCode();
  if(code<200||code>=300)throw new Error('GITHUB_'+code);
  const text=response.getContentText();return text?JSON.parse(text):null;
}
function adminConfig_(repo) {
  const file=adminGithub_('repos/studiomomentum/'+repo+'/contents/system_config.json?ref=main');
  const value=JSON.parse(Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g,''))).getDataAsString('UTF-8'));
  return {file:file,value:value};
}
function adminRun_(runId,workflow) {
  workflow=workflow||ADMIN_WORKFLOW_;
  if(!Number.isSafeInteger(runId)||runId<=0)throw new Error('INVALID_RUN');
  const run=adminGithub_('repos/'+ADMIN_REPO_+'/actions/runs/'+runId);
  if(run.event!=='workflow_dispatch'||run.head_branch!=='main'||!((run.path||'')==='.github/workflows/'+workflow||(run.path||'').startsWith('.github/workflows/'+workflow+'@')))throw new Error('INVALID_RUN');
  return {runId:run.id,status:run.status,conclusion:run.conclusion||null,phase:run.status==='completed'?(run.conclusion==='success'?'success':'failed'):run.status==='in_progress'?'running':'accepted'};
}
function adminStageStart_(request,workflow,key) {
  if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(request.requestId))throw new Error('INVALID_REQUEST');
  return adminLock_(()=>{
    const previous=adminRead_(key,null);
    if(previous){
      if(previous.runId){
        const run=adminRun_(previous.runId,workflow);
        if(run.status!=='completed'||previous.requestId===request.requestId)return run;
      }else if(previous.phase==='unknown')return {phase:'unknown',message:'접수 결과 확인 필요 · 자동 재실행하지 않습니다.'};
    }
    const list=adminGithub_('repos/'+ADMIN_REPO_+'/actions/workflows/'+workflow+'/runs?event=workflow_dispatch&branch=main&per_page=100');
    const active=(list.workflow_runs||[]).find(r=>r.status!=='completed');
    if(active){adminWrite_(key,{requestId:request.requestId,runId:active.id});return adminRun_(active.id,workflow);}
    const actor=adminGithub_('user').login;
    const record={requestId:request.requestId,phase:'unknown',requestedAt:Date.now(),actor:actor,baseline:(list.workflow_runs||[]).map(r=>r.id)};
    adminWrite_(key,record); // Write before POST; response loss must never produce a duplicate dispatch.
    try{
      const receipt=adminGithub_('repos/'+ADMIN_REPO_+'/actions/workflows/'+workflow+'/dispatches','post',{ref:'main',inputs:workflow===ADMIN_WORKFLOW_?{force:true}:{},return_run_details:true});
      if(!Number.isSafeInteger(receipt&&receipt.workflow_run_id))return {phase:'unknown'};
      record.runId=receipt.workflow_run_id;record.phase='accepted';adminWrite_(key,record);
      return {phase:'accepted',runId:record.runId,status:'queued'};
    }catch(error){
      if(/^GITHUB_4\d\d$/.test(error.message)){adminProps_().deleteProperty(key);throw error;}
      return {phase:'unknown',message:'접수 결과 확인 필요 · 자동 재실행하지 않습니다.'};
    }
  });
}
function adminStageStatus_(workflow,key) {
  return adminLock_(()=>{
    const previous=adminRead_(key,null);
    if(!previous)return {phase:'idle'};
    if(!previous.runId&&previous.baseline&&previous.actor){
      const list=adminGithub_('repos/'+ADMIN_REPO_+'/actions/workflows/'+workflow+'/runs?event=workflow_dispatch&branch=main&per_page=100');
      const candidates=(list.workflow_runs||[]).filter(r=>!previous.baseline.includes(r.id)&&r.actor&&r.actor.login===previous.actor&&Date.parse(r.created_at)>=previous.requestedAt-5000);
      if(candidates.length===1){previous.runId=candidates[0].id;previous.phase='accepted';adminWrite_(key,previous);}
    }
    return previous.runId?adminRun_(previous.runId,workflow):{phase:'unknown'};
  });
}
function adminClassifyStart_(request) {return adminStageStart_(request,ADMIN_WORKFLOW_,'ADMIN_CLASSIFY_LAST');}
function adminClassifyStatus_() {return adminStageStatus_(ADMIN_WORKFLOW_,'ADMIN_CLASSIFY_LAST');}
function adminSearchStart_(request) {return adminStageStart_(request,ADMIN_SEARCH_WORKFLOW_,'ADMIN_SEARCH_LAST');}
function adminSearchStatus_() {return adminStageStatus_(ADMIN_SEARCH_WORKFLOW_,'ADMIN_SEARCH_LAST');}
function adminSettings_(request) {
  const repo=request.setting==='email_system_enabled'?'momentum-cold-mailer':request.setting==='client_access_blocked'?'studiomomentum.github.io':null;
  if(!repo||typeof request.value!=='boolean')throw new Error('INVALID_REQUEST');
  return adminLock_(()=>{
    const config=adminConfig_(repo);
    const mail=request.setting==='email_system_enabled';
    const workflow='repos/'+ADMIN_REPO_+'/actions/workflows/drip_sender.yml';
    function syncSender(enabled) {
      adminGithub_(workflow+(enabled?'/enable':'/disable'),'put');
      const state=adminGithub_(workflow).state;
      if(state!==(enabled?'active':'disabled_manually'))throw new Error('SENDER_SCHEDULE_SYNC_FAILED');
    }
    // ON: restore scheduling before opening the send guard. OFF: close the
    // send guard before stopping scheduling. Never dispatch or cancel SMTP.
    if(mail&&request.value)syncSender(true);
    config.value[request.setting]=request.value;config.value.updated_at=new Date().toISOString();
    adminGithub_('repos/studiomomentum/'+repo+'/contents/system_config.json','put',{message:'Update operational switch',content:Utilities.base64Encode(JSON.stringify(config.value,null,2)+'\n',Utilities.Charset.UTF_8),sha:config.file.sha,branch:'main'});
    if(mail&&!request.value)syncSender(false);
    return {setting:request.setting,value:request.value};
  });
}
// Server-side identities only: the browser supplies a tracking token, never an email/URL.
function adminExclusions_(request) {
  return adminLock_(()=>{
    const config=adminConfig_('momentum-cold-mailer');
    const entries=config.value.excluded_targets||{};
    if(request.action==='targets.exclusions')return {entries:entries};
    if(typeof request.token!=='string'||!/^[a-f0-9]{8,64}$/.test(request.token))throw new Error('INVALID_REQUEST');
    if(entries[request.token])return {entries:entries,excluded:true};
    // Do not promise cancellation of a message already being processed.
    const runs=adminGithub_('repos/'+ADMIN_REPO_+'/actions/workflows/drip_sender.yml/runs?branch=main&per_page=20');
    if((runs.workflow_runs||[]).some(r=>r.status!=='completed'))throw new Error('SENDER_BUSY');
    const file=adminGithub_('repos/'+ADMIN_REPO_+'/contents/targets_db.csv?ref=main');
    const csv=Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g,''))).getDataAsString('UTF-8').replace(/^\uFEFF/,'');
    const rows=Utilities.parseCsv(csv),headers=rows.shift();
    const matches=rows.filter(r=>r[headers.indexOf('토큰')]===request.token);
    if(matches.length!==1)throw new Error('INVALID_TARGET');
    const row=matches[0],get=k=>row[headers.indexOf(k)]||'';
    if(get('상태')!=='READY')throw new Error('TARGET_NOT_READY');
    entries[request.token]={channel_url:get('채널URL').replace(/\/$/,''),email:get('이메일').trim().toLowerCase(),company:get('회사채널명'),excluded_at:new Date().toISOString(),reason:'operator_not_target'};
    config.value.excluded_targets=entries;config.value.updated_at=new Date().toISOString();
    // CAS keeps a simultaneous configuration change intact. Repeating an exclusion is idempotent.
    adminGithub_('repos/'+ADMIN_REPO_+'/contents/system_config.json','put',{message:'Permanently exclude reviewed outreach target',content:Utilities.base64Encode(JSON.stringify(config.value,null,2)+'\n',Utilities.Charset.UTF_8),sha:config.file.sha,branch:'main'});
    return {entries:entries,excluded:true};
  });
}
function adminRoute_(request) {
  try{
    if(request.action==='login')return {ok:true,result:adminLogin_(request)};
    const session=adminSession_(request.session);
    if (typeof request.action==='string' && request.action.startsWith('content.')) return {ok:true,result:contentRoute_(request)};
    switch(request.action){
      case 'session':return {ok:true,result:{expiresAt:session.expiresAt}};
      case 'logout':adminLock_(()=>adminWrite_('ADMIN_SESSIONS',adminRead_('ADMIN_SESSIONS',[]).filter(s=>!adminEqual_(s.hash,session.hash))));return {ok:true,result:{loggedOut:true}};
      case 'classify.start':return {ok:true,result:adminClassifyStart_(request)};
      case 'classify.status':return {ok:true,result:adminClassifyStatus_()};
      case 'search.start':return {ok:true,result:adminSearchStart_(request)};
      case 'search.status':return {ok:true,result:adminSearchStatus_()};
      case 'targets.exclude':
      case 'targets.exclusions':return {ok:true,result:adminExclusions_(request)};
      case 'settings.status':return {ok:true,result:{email_system_enabled:adminConfig_('momentum-cold-mailer').value.email_system_enabled===true}};
      case 'settings.update':return {ok:true,result:adminSettings_(request)};
      default:throw new Error('INVALID_REQUEST');
    }
  }catch(error){
    const message=String(error.message||'');
    const allowed=/^(UNAUTHORIZED|INVALID_LOGIN|LOGIN_RATE_LIMIT|SERVER_NOT_CONFIGURED|BUSY|SENDER_BUSY|INVALID_TARGET|TARGET_NOT_READY|SYSTEM_PAUSED|INVALID_REQUEST|INVALID_RUN|GITHUB_CONNECTION|GITHUB_\d{3}|CONTENT_[A-Z_]+)$/;
    return {ok:false,error:allowed.test(message)?message:'SERVER_ERROR'};
  }
}
// Owner-only editor execution grants UrlFetch access without any control operation.
function verifyAdminRelaySetup() {
  const ready=['ADMIN_SESSION_SECRET','ADMIN_PASSWORD_CHECK','MOMENTUM_GITHUB_TOKEN'].every(k=>!!adminProps_().getProperty(k));
  if(!ready)throw new Error('Server properties missing');
  const response=UrlFetchApp.fetch('https://api.github.com/rate_limit',{muteHttpExceptions:true});
  console.log('Admin relay setup ready: '+(response.getResponseCode()===200));
}
