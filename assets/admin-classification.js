/* The authenticated relay owns Ubuntu dispatch, deduplication and run identity. */
function momentumStageControl(action,key,prefix,label) {
  let busy=false,timer=null,state=read();
  function read(){try{const value=JSON.parse(localStorage.getItem(key));return value?.backend==='cloud'?value:null;}catch(_){return null;}}
  function render(){
    const pending=state&&!['success','failed','idle'].includes(state.phase),button=document.getElementById(prefix+'Button');
    if(!button)return;
    button.disabled=busy;button.textContent=busy?(state?.phase==='running'?label+' 실행 중':'처리 중'):pending?'실행 상태 확인':'수동 '+label+' · 이어하기';
    document.getElementById(prefix+'Status').textContent=state?.message||(action==='search'?'중단 검색 이어하기 · 메일 발송 없음':'기존 후보 근거 수집·분류 이어하기 · 메일 발송 없음');
    if(action==='classify')document.getElementById('kpiCard_READY').dataset.state=state?.phase||'idle';
    const link=document.getElementById(prefix+'RunLink');if(link){link.hidden=true;link.removeAttribute('href');}
    if(action==='classify'){
      const mirror=document.getElementById('progressClassifyButton');
      if(mirror){
        mirror.disabled=button.disabled;mirror.textContent=button.textContent;
        document.getElementById('progressClassifyStatus').textContent=document.getElementById(prefix+'Status').textContent;
        const detail=document.getElementById('progressClassifyRunLink');if(detail){detail.hidden=true;detail.removeAttribute('href');}
      }
    }
  }
  function save(next){state={...state,...next};localStorage.setItem(key,JSON.stringify(state));render();}
  function stop(){busy=false;clearTimeout(timer);timer=null;render();}
  function display(result){
    if(result.backend!=='cloud')throw Error('우분투 실행 연결을 확인하지 못했습니다.');
    const reason={CHECKOUT_DIRTY_RECONCILE_REQUIRED:'이전 저장소 실행 실패 · Drive 전환 후 다시 실행 가능',COMMAND_FAILED:'서버 작업 실패 · 기록 확인 필요',INTERRUPTED_RECONCILE_REQUIRED:'이전 작업 중단 · 실제 결과 확인 필요'};
    const labels={accepted:'우분투 접수됨 · 실행 대기 중',running:'우분투 실행 중 · '+(action==='search'?'검색 후보 수집':'기존 후보 근거 수집·분류 및 READY 등록'),success:label+' 실행 완료 · 우분투 진행판에서 결과 확인',failed:'최근 실행 실패 · '+(reason[result.conclusion]||result.conclusion||'서버 기록 확인'),unknown:'우분투 접수 결과 확인 필요 · 자동 재실행하지 않습니다.',idle:'우분투 수동 '+label+' 요청 대기'};
    save({...result,message:(labels[result.phase]||'우분투 실행 상태 확인 필요')+(result.runId?' · 작업 #'+result.runId:'')});
  }
  async function track(result){
    display(result);
    if(['success','failed','idle','unknown'].includes(result.phase)){
      stop();if(result.phase==='success'){await loadTargets();updateKPIs();renderTable();}return;
    }
    if(Date.now()-state.watchStartedAt>30*60*1000){save({phase:'unknown',message:'확인 지연 · 상태 확인으로 이어서 조회하세요.'});stop();return;}
    timer=setTimeout(async()=>{try{await track(await MomentumAdmin.call(action+'.status'));}catch(e){save({phase:'unknown',message:e.message});stop();}},5000);
  }
  async function start(){
    if(busy)return;busy=true;state=read();render();
    try{
      const pending=state&&!['success','failed','idle'].includes(state.phase);
      save({message:pending?'실행 상태 확인 중…':label+' 실행 요청 중…',watchStartedAt:Date.now(),requestId:pending?state.requestId:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')});
      const result=await MomentumAdmin.call(pending?action+'.status':action+'.start',pending?{}:{requestId:state.requestId});
      await track(result);
    }catch(e){save({phase:e.code==='NETWORK'?'unknown':'failed',message:(e.code==='NETWORK'?'접수/실행 결과 확인 필요 · ':'')+e.message});stop();}
  }
  async function sync(){
    if(busy||!window.OpsAuth?.hasAdminSession())return;busy=true;render();
    try{save({watchStartedAt:Date.now()});await track(await MomentumAdmin.call(action+'.status'));}
    catch(e){save({phase:'unknown',backend:'cloud',message:'우분투 상태 조회 실패 · '+e.message});stop();}
  }
  window.addEventListener('storage',e=>{if(e.key===key&&!busy){state=read();render();}});
  window.addEventListener('ops-authenticated',sync);
  window.addEventListener('ops-cleared',()=>{clearTimeout(timer);timer=null;busy=false;state=null;localStorage.removeItem(key);render();});
  document.addEventListener('DOMContentLoaded',sync);
  render();return {start,render,sync};
}
window.MomentumClassification=momentumStageControl('classify','sm_manual_classification_v2','classify','분류');
window.MomentumSearch=momentumStageControl('search','sm_manual_search_v1','search','서치');
