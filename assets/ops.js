'use strict';
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const models=[
{id:'momentum',icon:'↗',name:'솟 모멘텀',desc:'유입 → 상담 → 영업 → 성과 추적',stages:[['prospect','대상 검색 · 분류','중복 제거 / 적합성 검증 / 발송 큐'],['mail','콜드메일 · 영업','예약 발송 / 반송·수신 거부 / 전환'],['blog','콘텐츠 · 검색 유입','네이버 · Threads · 티스토리 / SEO·GEO'],['consult','AI 상담','사이트 상담 / 답변 / 상담 결과 저장']],foot:'블로그 유입은 인바운드 · 콜드메일은 아웃바운드',link:true},
{id:'aight',icon:'▷',name:'aight',desc:'우분투 기획 → 맥북 제작 → 백업 → YouTube',stages:[['aight-plan','기획 · 대본','주제 / 대본 버전 / 장면별 지문 확정'],['aight-assets','ComfyUI · 제작 지시','배경·투명 PNG / 장면 연결 / 맥북 접수'],['aight-edit','손 편집기 · 백업','편집 / 렌더링 / 파일 해시 / 백업 검증'],['aight-publish','YouTube 발행','우분투 업로드 / 공개 일정 / 영상 ID']],foot:'연동 설계 완료 · 맥북 작업자 및 편집기 인터페이스 확인 필요'},
{id:'btc',icon:'⌁',name:'BTC 터미널',desc:'시세와 파생 데이터의 수집 · 보존 · 리포트',stages:[['btc','Binance 가격','확정 봉 / 1분봉·다른 시간봉 / 결측 검사'],['cvd','CVD · OI','공급원 응답 / 시간축 정렬 / 중복 제거'],['btc','DB · Google Drive','저장 결과 / 원본 읽기 검증 / 복구 파일'],['alt','일일 · 주간 알트','데이터 기준일 / 후보 분석 / 보고서 검증']],foot:'가격 수집과 CVD·OI 수집을 별도 검증'}];
let data={cards:{}},view='overview',busy=false,failed=false;
function health(card){
 if(!card)return {label:'설계 · 미연결',cls:'muted',warn:true};
 const age=(Date.now()-Date.parse(card.evidenceAt))/1000;
 if(card.maxAgeSeconds&&Number.isFinite(age)&&age>card.maxAgeSeconds)return {label:'갱신 지연',cls:'warn',warn:true};
 if(card.maxAgeSeconds&&!Number.isFinite(age))return {label:'실행 기록 없음',cls:'warn',warn:true};
 if(/오류|실패|확인 필요|조회 불가|중지|꺼짐|필요|미완료|OFF/.test(card.state))return {label:card.state,cls:'warn',warn:true};
 return {label:card.state,cls:'',warn:false};
}
function tag(card){const h=health(card);return `<span class="tag ${h.cls}">${escapeHtml(h.label)}</span>`;}
function displayTime(value){if(!value||!Number.isFinite(Date.parse(value)))return '기록 없음';return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function render(){
 const titles={overview:'전체 관제',momentum:'솟 모멘텀',aight:'aight',btc:'BTC 터미널',system:'서버 · 백업'};
 $('breadcrumb').textContent=titles[view];
 $('title').innerHTML=view==='overview'?'모든 프로젝트의 흐름을,<br>한눈에.':escapeHtml(titles[view])+' 운영실';
 $('subtitle').textContent=view==='aight'?'장면별 이미지부터 맥북 렌더링, 백업과 최종 발행까지.':'실행 상태와 실제 산출물, 연결이 필요한 작업을 함께 확인하세요.';
 document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
 $('sectionTitle').textContent=view==='system'?'서버와 제작 인프라':'프로젝트 파이프라인';
 const shown=view==='overview'?models:models.filter(m=>m.id===view);
 $('projects').innerHTML=shown.map(m=>{
  const connected=m.stages.filter(s=>data.cards[s[0]]&&!/연결 확인/.test(data.cards[s[0]].state)).length;
  return `<article class="project"><div class="projecthead"><span class="icon">${m.icon}</span><div><h3>${m.name}</h3><p>${m.desc}</p></div><span class="tag ${connected?'':'muted'}">${connected?`${connected}/4 단계 조회`:'파이프라인 설계'}</span></div><div class="pipeline">${m.stages.map((s,i)=>`<div class="stage"><div class="num">STEP 0${i+1}</div><h4>${s[1]}</h4>${tag(data.cards[s[0]])}<p>${s[2]}</p></div>`).join('')}</div><div class="projectfoot"><span>${m.foot}</span>${m.link?'<a href="https://studiomomentum.github.io/admin.html">모멘텀 어드민 ↗</a>':'<button data-plan="'+m.id+'">운영 설계 보기 →</button>'}</div></article>`;
 }).join('');
 const keys=view==='system'?['backup','bgm','production']:view==='momentum'?['outreach','blog','consult']:view==='btc'?['btc','cvd','alt']:view==='aight'?['production','bgm','backup']:['btc','alt','outreach','blog','backup'];
 $('evidence').innerHTML=keys.map(key=>{const c=data.cards[key];return `<div class="evidencerow"><div><b>${escapeHtml(c?.label||({btc:'BTC 가격',alt:'알트 보고서',outreach:'검색·메일',blog:'블로그',backup:'백업',production:'영상 제작 환경',bgm:'BGM',cvd:'CVD · OI',consult:'상담'})[key])}</b><p>${escapeHtml(c?.summary||'서버 연결 후 실제 실행 기록을 표시합니다.')}</p>${c?.evidenceAt?'<p>원본 기록 '+escapeHtml(displayTime(c.evidenceAt))+'</p>':''}</div><button data-key="${key}">${health(c).warn?'점검':'기록'} 보기 →</button></div>`;}).join('');
 const cards=Object.values(data.cards); const missing=new Set(models.flatMap(m=>m.stages.map(s=>s[0])).filter(key=>!data.cards[key]));$('healthy').textContent=cards.length?String(cards.filter(c=>!health(c).warn).length).padStart(2,'0'):'—';$('attention').textContent=cards.length?String(cards.filter(c=>health(c).warn).length+missing.size).padStart(2,'0'):'—';
 $('checked').textContent=data.checkedAt?new Date(data.checkedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'—';
}
const plans={aight:['각 제작 요청에 job_id·대본 버전·장면 ID·입력 파일 해시를 부여합니다.','ComfyUI: 장면 배경과 투명 PNG의 크기·알파 채널·생성 결과를 검사합니다.','맥북: 작업 접수 ACK → 실행 → 진행률 → 렌더 결과를 회신합니다. 심박과 실제 진행 시각을 분리합니다.','손 편집기의 정확한 제품·버전 및 자동화 인터페이스를 확인한 뒤 실행 어댑터를 연결합니다.','백업 서버: 영상 크기·파일 해시·읽기 검증을 통과해야 업로드 대기로 이동합니다.','YouTube: 업로드 세션·영상 ID·처리 결과·공개 시간을 기록하고 중복 업로드를 방지합니다.','실패 단계만 재시도하고 지수 백오프·최대 시도 수·수동 검수 대기를 둡니다.'],btc:['Binance 가격 수집은 기존 minute·intervals 수집기와 Drive 읽기 검증 결과를 사용합니다.','CVD·OI는 가격 수집기와 별개입니다. 공급원·작업자·DB 최신 시각을 연결해야 합니다.','원본 시각과 수집 시각을 분리하고 중복·역순·결측 봉을 확인합니다.','Drive는 보존 저장소로 사용합니다. 잠금·원자적 쓰기·복구 파일로 중복 쓰기를 막습니다.','일일과 주간 리포트는 각 기준일·마지막 성공·다음 예약·저장 검증을 확인합니다.','상태 화면을 갱신한 시각으로 데이터 원본의 최신성을 대체하지 않습니다.']};
function detail(title,summary,lines){$('detailTitle').textContent=title;$('detailSummary').textContent=summary;$('detailList').replaceChildren(...lines.map(line=>{const li=document.createElement('li');li.textContent=line;return li;}));$('detail').showModal();}
document.addEventListener('click',event=>{const key=event.target.closest('[data-key]')?.dataset.key;const plan=event.target.closest('[data-plan]')?.dataset.plan;if(key){const c=data.cards[key];detail(c?.label||'서버 미연결',c?.state||'연결 후 실행 기록 표시',c?.details||['실시간 상태 API가 연결되어야 조회할 수 있습니다.']);}if(plan)detail(models.find(m=>m.id===plan).name,'구현·연동 기준',plans[plan]);});
$('closeDetail').addEventListener('click',()=>$('detail').close());
function changeView(){view=['momentum','aight','btc','system'].includes(location.hash.slice(1))?location.hash.slice(1):'overview';render();}
window.addEventListener('hashchange',changeView);
async function refresh(){if(busy)return;busy=true;$('refresh').disabled=true;try{const response=await fetch('/api/ops',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('HTTP');const next=await response.json();if(!next.cards||next.error)throw Error('DATA');data=next;failed=false;$('connection').textContent='서버 기록 연결';$('connectionDot').className='dot green';$('notice').textContent='우분투 실행 기록 연결 · 15초마다 조회합니다. 서버 서비스 상태와 작업 원본 시각을 함께 확인하세요.';}catch(_){failed=true;$('connection').textContent='실시간 연결 없음';$('connectionDot').className='dot amber';$('notice').textContent=data.checkedAt?'연결이 끊겼습니다. 아래는 '+displayTime(data.checkedAt)+'에 조회한 기록이며 현재 상태가 아닙니다.':'통합 화면 준비 완료 · 실시간 조회는 우분투의 로컬 관제 서버에서 제공합니다. 현재 화면은 미연결이며 실행 상태를 추정하지 않습니다.';}finally{render();busy=false;$('refresh').disabled=false;}}
$('refresh').addEventListener('click',refresh);function tick(){const now=new Date();$('clock').textContent=now.toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul'});$('date').textContent=now.toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});if(data.checkedAt&&Date.now()-Date.parse(data.checkedAt)>45000&&!failed){$('connection').textContent='상태 수집 지연';$('connectionDot').className='dot amber';} }changeView();tick();refresh();setInterval(refresh,15000);setInterval(tick,1000);
