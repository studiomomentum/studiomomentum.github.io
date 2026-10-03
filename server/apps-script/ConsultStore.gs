/* Private consultation store. Public telemetry never contains messages or access tokens. */
const CONSULT_VERSION_ = 1;
function consultFile_() {
  const props=adminProps_(),id=props.getProperty('CONSULT_DB_FILE_ID');
  if(id)return DriveApp.getFileById(id);
  const file=DriveApp.createFile('momentum_private_consultations.json',JSON.stringify({version:1,sessions:[]}),MimeType.PLAIN_TEXT);
  props.setProperty('CONSULT_DB_FILE_ID',file.getId());return file;
}
function consultDb_(){const file=consultFile_(),data=JSON.parse(file.getBlob().getDataAsString('UTF-8'));if(data.version!==1||!Array.isArray(data.sessions))throw Error('CONSULT_STORE_INVALID');return {file:file,data:data};}
function consultSave_(db){db.file.setContent(JSON.stringify(db.data));}
function consultAvailable_(){return Date.now()-Number(adminProps_().getProperty('CONSULT_HEARTBEAT')||0)<90000;}
function consultToken_(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('CONSULT_UNAUTHORIZED');return adminHash_(token);}
function consultPublicView_(s){return {id:s.id,expiresAt:s.expiresAt,messages:s.messages.map(m=>({role:m.role,text:m.text,requestId:m.requestId})),pending:s.pending?{requestId:s.pending.requestId,state:s.pending.state}:null,turns:s.turns,limit:12};}
function consultSession_(db,r){const hash=consultToken_(r.token),s=db.data.sessions.find(s=>s.id===r.id&&adminEqual_(s.hash,hash));if(!s||s.expiresAt<Date.now())throw Error('CONSULT_UNAUTHORIZED');return s;}
function consultPublic_(r){
  try{return {ok:true,result:adminLock_(()=>{
    if(r.action==='status')return {online:consultAvailable_(),version:CONSULT_VERSION_};
    const now=Date.now();
    if(r.action==='start'){
      const hash=consultToken_(r.token);if(r.consent!==true)throw Error('CONSULT_CONSENT_REQUIRED');
      const db=consultDb_();const old=db.data.sessions.find(s=>adminEqual_(s.hash,hash));
      if(old){if(old.expiresAt<now)throw Error('CONSULT_UNAUTHORIZED');return consultPublicView_(old);}
      if(!consultAvailable_())throw Error('CONSULT_OFFLINE');
      // Global ceilings protect a small public site even if visitor identities are reset.
      if(db.data.sessions.filter(s=>s.createdAt>now-60000).length>=5||db.data.sessions.filter(s=>s.createdAt>now-86400000).length>=100)throw Error('CONSULT_RATE_LIMIT');
      const s={id:Utilities.getUuid(),hash:hash,createdAt:now,expiresAt:now+86400000,channel:r.channel==='OUTBOUND'?'OUTBOUND':'INBOUND',source:String(r.source||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40),ref:String(r.ref||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),test:r.test===true,messages:[],turns:0,pending:null,kakaoOpenedAt:null,contactedAt:null};
      db.data.sessions.push(s);consultSave_(db);return consultPublicView_(s);
    }
    const db=consultDb_(),s=consultSession_(db,r);
    if(r.action==='poll'){
      if(s.pending&&now-s.pending.createdAt>120000){s.messages.push({role:'assistant',text:'답변 준비가 지연되고 있어요. PD와 직접 상담하실 수 있습니다',requestId:s.pending.requestId});s.pending=null;consultSave_(db);}
      return consultPublicView_(s);
    }
    if(r.action==='send'){
      if(typeof r.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(r.requestId)||typeof r.text!=='string'||!r.text.trim()||r.text.length>1000)throw Error('CONSULT_INVALID_REQUEST');
      if(s.messages.some(m=>m.requestId===r.requestId))return consultPublicView_(s);
      if(s.pending)throw Error('CONSULT_BUSY');
      if(!consultAvailable_())throw Error('CONSULT_OFFLINE');
      if(s.turns>=12||now-(s.lastSentAt||0)<3000)throw Error('CONSULT_RATE_LIMIT');
      const today=new Date(now).toISOString().slice(0,10),budget=adminRead_('CONSULT_DAILY_TURNS',{day:today,count:0});
      if(budget.day!==today){budget.day=today;budget.count=0;}if(budget.count>=300)throw Error('CONSULT_RATE_LIMIT');
      budget.count++;adminWrite_('CONSULT_DAILY_TURNS',budget);
      s.messages.push({role:'user',text:r.text.trim(),requestId:r.requestId});s.turns++;s.lastSentAt=now;
      s.pending={requestId:r.requestId,state:'queued',createdAt:now};consultSave_(db);adminProps_().setProperty('CONSULT_HAS_WORK','1');return consultPublicView_(s);
    }
    if(r.action==='handoff'){
      if(typeof r.summary!=='string'||r.summary.length>8000)throw Error('CONSULT_INVALID_REQUEST');
      s.customerSummary=r.summary;s.kakaoOpenedAt=now;consultSave_(db);return {saved:true};
    }
    throw Error('CONSULT_INVALID_REQUEST');
  })};}catch(e){return {ok:false,error:/^(CONSULT_[A-Z_]+|BUSY)$/.test(e.message)?e.message:'CONSULT_SERVER_ERROR'};}
}
function consultWorker_(r){
  try{
    if(!adminEqual_(consultToken_(r.workerToken),adminProps_().getProperty('CONSULT_WORKER_HASH')))throw Error('CONSULT_UNAUTHORIZED');
    return {ok:true,result:adminLock_(()=>{
      const now=Date.now();
      if(r.action==='offline'){adminProps_().deleteProperty('CONSULT_HEARTBEAT');return {ok:true};}
      if(r.action==='claim'){
        adminProps_().setProperty('CONSULT_HEARTBEAT',String(now));
        if(adminProps_().getProperty('CONSULT_HAS_WORK')!=='1')return {job:null};
        const db=consultDb_();const s=db.data.sessions.find(s=>s.pending&&s.pending.state==='queued');
        if(!s){adminProps_().setProperty('CONSULT_HAS_WORK','0');return {job:null};}
        if(now-s.pending.createdAt>120000){s.messages.push({role:'assistant',text:'답변 준비가 지연되고 있어요. PD와 직접 상담하실 수 있습니다',requestId:s.pending.requestId});s.pending=null;consultSave_(db);return {job:null};}
        s.pending.state='running';s.pending.claim=Utilities.getUuid();consultSave_(db);
        return {job:{id:s.id,requestId:s.pending.requestId,claim:s.pending.claim,channel:s.channel,messages:s.messages}};
      }
      if(r.action==='complete'){
        const db=consultDb_(),s=db.data.sessions.find(s=>s.id===r.id);
        if(!s)throw Error('CONSULT_INVALID_REQUEST');
        if(s.messages.some(m=>m.role==='assistant'&&m.requestId===r.requestId))return {saved:true};
        if(!s.pending||s.pending.requestId!==r.requestId||!adminEqual_(s.pending.claim,r.claim))throw Error('CONSULT_INVALID_REQUEST');
        if(typeof r.answer!=='string'||!r.answer.trim()||r.answer.length>1600)throw Error('CONSULT_INVALID_REQUEST');
        s.messages.push({role:'assistant',text:r.answer,requestId:r.requestId});s.pending=null;consultSave_(db);return {saved:true};
      }
      throw Error('CONSULT_INVALID_REQUEST');
    })};
  }catch(e){return {ok:false,error:/^(CONSULT_[A-Z_]+|BUSY)$/.test(e.message)?e.message:'CONSULT_SERVER_ERROR'};}
}
function consultAdmin_(r){return adminLock_(()=>{
  if(r.action==='consult.worker.register'){
    const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');adminProps_().setProperty('CONSULT_WORKER_HASH',adminHash_(token));return {workerToken:token};
  }
  const db=consultDb_();
  if(r.action==='consult.list')return {online:consultAvailable_(),sessions:db.data.sessions.slice(-100).reverse().map(s=>({id:s.id,createdAt:s.createdAt,channel:s.channel,test:s.test,messages:s.messages,customerSummary:s.customerSummary||'',kakaoOpenedAt:s.kakaoOpenedAt,contactedAt:s.contactedAt}))};
  if(r.action==='consult.contact.confirm'){
    const s=db.data.sessions.find(s=>s.id===r.id);if(!s)throw Error('CONSULT_INVALID_REQUEST');s.contactedAt=Date.now();consultSave_(db);return {confirmed:true};
  }
  throw Error('CONSULT_INVALID_REQUEST');
});}
