/* The server owns authorization, GitHub credentials, deduplication and run identity. */
window.MomentumClassification = (() => {
  const key='sm_manual_classification_v2';
  const runPage='https://github.com/studiomomentum/momentum-cold-mailer/actions';
  let busy=false,timer=null,state=read();
  function read(){try{return JSON.parse(localStorage.getItem(key))||null;}catch(_){return null;}}
  function render(){
    const pending=state&&!['success','failed','idle'].includes(state.phase),button=document.getElementById('classifyButton');
    button.disabled=busy;button.textContent=busy?(state?.phase==='running'?'분류 실행 중':'처리 중'):pending?'실행 상태 확인':'분류·장전 실행';
    document.getElementById('classifyStatus').textContent=state?.message||'기존 후보 분류 · 메일 발송 없음';
    document.getElementById('kpiCard_READY').dataset.state=state?.phase||'idle';
    const link=document.getElementById('classifyRunLink');link.hidden=!state;link.href=Number.isSafeInteger(state?.runId)?runPage+'/runs/'+state.runId:runPage+'/workflows/auto_prospect.yml';
  }
  function save(next){state={...state,...next};localStorage.setItem(key,JSON.stringify(state));render();}
  function stop(){busy=false;clearTimeout(timer);timer=null;render();}
  function display(result){
    const labels={accepted:'접수됨 · 실행 대기 중',running:'실행 중 · 기존 후보 분류 및 READY 등록',success:'실행 완료 · 등록 결과는 실행 상세에서 확인',failed:'실행 실패 · '+(result.conclusion||'상세 확인'),unknown:'접수 결과 확인 필요 · 자동 재실행하지 않습니다.',idle:'실행 중인 수동 분류가 없습니다.'};
    save({...result,message:labels[result.phase]||'실행 상태 확인 필요'});
  }
  async function track(result){
    display(result);
    if(['success','failed','idle','unknown'].includes(result.phase)){
      stop();if(result.phase==='success'){await loadTargets();updateKPIs();renderTable();}return;
    }
    if(Date.now()-state.watchStartedAt>30*60*1000){save({phase:'unknown',message:'확인 지연 · 상태 확인으로 이어서 조회하세요.'});stop();return;}
    timer=setTimeout(async()=>{try{await track(await MomentumAdmin.call('classify.status'));}catch(e){save({phase:'unknown',message:e.message});stop();}},5000);
  }
  async function start(){
    if(busy)return;busy=true;state=read();render();
    try{
      const pending=state&&!['success','failed','idle'].includes(state.phase);
      save({watchStartedAt:Date.now(),requestId:pending?state.requestId:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')});
      const result=await MomentumAdmin.call(pending?'classify.status':'classify.start',pending?{}:{requestId:state.requestId});
      await track(result);
    }catch(e){save({phase:e.code==='NETWORK'?'unknown':'failed',message:(e.code==='NETWORK'?'접수/실행 결과 확인 필요 · ':'')+e.message});stop();}
  }
  window.addEventListener('storage',e=>{if(e.key===key&&!busy){state=read();render();}});
  render();return {start};
})();
