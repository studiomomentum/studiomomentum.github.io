'use strict';
window.MomentumAdmin={call:(action,payload)=>['settings.status','settings.update','targets.exclusions','targets.exclude'].includes(action)?ProjectControls.request('momentum-call',{action,payload:payload||{}}):OpsAuth.call(action,payload),cacheScope:()=>OpsAuth.cacheScope(),loginScreen:()=>OpsAuth.invalid()};
window.handleLogout=()=>OpsAuth.logout();
window.MomentumIntegration=(()=>{
 const definitions={targets:['타깃 · 메일','발송 대상, 예약 대기, 반송과 고객 반응을 관리합니다.','SENT'],search:['검색 · 분류','후보 발굴부터 검증·분류, 발송 DB 장전까지 확인합니다.','SEARCH_DB'],content:['콘텐츠 · 발행','키워드 조사, 글 생성, 검수와 채널별 발행을 관리합니다.','CONTENT'],inbound:['유입 · 행동 분석','검색·소셜 유입, 방문 행동과 상담 전환을 확인합니다.','INBOUND'],consult:['AI 상담 기록','고객 대화와 실제 문의 도착 여부를 확인합니다.'],settings:['운영 설정','자동발송, 고객 사이트 접속과 고객 화면을 관리합니다.']};
 let ready=null,selected='targets';
 async function select(key){
  selected=definitions[key]?key:'targets';const [title,description,tab]=definitions[selected];
  document.getElementById('managementTitle').textContent=title;document.getElementById('managementDescription').textContent=description;
  document.querySelectorAll('[data-momentum-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.momentumNav===selected);a.setAttribute('aria-current',a.dataset.momentumNav===selected?'page':'false');});
  document.getElementById('momentumSettings').hidden=selected!=='settings';document.getElementById('momentumConsult').hidden=selected!=='consult';
  document.querySelector('#dashboardApp .dashboard-body').hidden=!tab;
  document.querySelector('#dashboardApp .kpi-grid').hidden=selected!=='targets';
  if(!OpsAuth.local&&!OpsAuth.session())return;
  const status=document.getElementById('managementStatus');status.textContent=ready?'관리 기능 연결됨':'관리 데이터를 불러오는 중…';
  try{
   if(!ready)ready=initDashboard();
   if(tab)setMainTab(tab);
   await ready;status.textContent='관리 기능 연결됨';if(selected==='search')window.MomentumSearchProgress?.refresh();
  }catch(error){status.textContent=error.message||'관리 데이터 연결을 확인해 주세요.';ready=null;}
 }
 window.addEventListener('ops-cleared',()=>{ready=null;dashboardStarted=false;clearInterval(dashboardPoll);targetsMap={};liveEvents=[];window.dispatchEvent(new Event('momentum-auth-cleared'));document.getElementById('tableBody').replaceChildren();document.getElementById('mobileCardsContainer').replaceChildren();});
 return {select};
})();
