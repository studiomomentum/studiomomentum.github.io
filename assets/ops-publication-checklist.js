/* Daily, read-only publication results from the existing authenticated admin. */
(()=>{
'use strict';
const root=document.getElementById('publicationChecklist');
if(!root)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayOf=v=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(v);return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
const today=()=>dayOf(new Date());
let day=today(),followToday=true,snapshot=null,error='',generation=0,loading=null,cleared=false;
root.innerHTML=`<div class="upload-heading"><div><div class="eyebrow">DAILY UPLOADS</div><h2>하루 업로드 체크리스트</h2><p>솟 모멘텀 · 쿠파스 프로젝트</p></div><div class="upload-date-controls"><button type="button" data-upload-shift="-1" aria-label="이전 날짜">‹</button><label>기준 날짜<input id="uploadChecklistDate" type="date" aria-label="업로드 기준 날짜"></label><button type="button" data-upload-shift="1" aria-label="다음 날짜">›</button><button type="button" data-upload-today>오늘</button><button type="button" data-upload-refresh>새로고침</button></div></div><p id="uploadChecklistNotice" class="upload-notice" role="status">업로드 기록을 확인하고 있습니다.</p><div id="uploadChecklistProjects" class="upload-projects"></div><p class="upload-footnote">한국시간 기준 · 15초 자동 갱신 · 공개 확인 기록이 있는 게시만 자동 체크합니다. 댓글은 본문 업로드 수에 추가하지 않습니다.</p>`;
const input=root.querySelector('#uploadChecklistDate'),notice=root.querySelector('#uploadChecklistNotice'),projects=root.querySelector('#uploadChecklistProjects');input.value=day;
function active(){return !['momentum','coupas','aight','btc','system'].includes(location.hash.slice(1).split('/')[0]);}
function allowed(){return !cleared&&window.OpsAuth&&(OpsAuth.local||!!OpsAuth.session());}
function clock(value,precision=1000){
 if(!value||!Number.isFinite(Date.parse(value)))return null;
 const d=new Date(value),options={timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false};
 if(precision<60000)options.second='2-digit';
 const time=d.toLocaleTimeString('en-GB',options);
 return (dayOf(d)===day?'':dayOf(d).slice(5)+' ')+time;
}
function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function renderCell(project,row,channel){
 const c=row.cells[channel.id];
 if(!c)return `<td class="upload-cell unassigned" data-channel="${esc(channel.label)}"><span>배정 없음</span></td>`;
 const time=clock(c.publishedAt,c.precisionMs||1000),url=safeURL(c.url),label=`${project.name} ${row.hour} ${channel.label} ${c.label}`;
 return `<td class="upload-cell ${esc(c.status)}" data-channel="${esc(channel.label)}"><div class="upload-state"><input type="checkbox" disabled ${c.checked?'checked':''} aria-label="${esc(label)}"><span>${esc(c.label)}</span></div>${c.checked?`<div class="upload-actual">실제 게시 <time datetime="${esc(c.publishedAt||'')}">${esc(time||'시각 미확인')}</time></div>`:c.overdue?'<small class="upload-overdue">예정 시각 지남</small>':''}${url?`<a class="upload-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">게시글 열기 ↗</a>`:''}${c.note?`<small class="upload-cell-note">${esc(c.note)}</small>`:''}</td>`;
}
function render(){
 const stale=snapshot&&Date.now()-Date.parse(snapshot.checkedAt)>45000;
 notice.classList.toggle('upload-warning',!!error||!!stale);
 notice.textContent=error?(snapshot?`연결 지연 · ${clock(snapshot.checkedAt)}에 조회한 기록입니다. `:'')+error:snapshot?`${snapshot.date} · 최근 조회 ${clock(snapshot.checkedAt)}${stale?' · 갱신 지연':''}`:'업로드 기록을 확인하고 있습니다.';
 if(!snapshot){projects.innerHTML=error?'<p class="upload-empty">연결이 복구되면 실제 업로드 기록을 다시 불러옵니다.</p>':'<p class="upload-empty">시간대와 채널별 업로드를 불러오는 중…</p>';return;}
 projects.innerHTML=snapshot.projects.map(p=>{
  const s=p.summary,worker=clock(p.producer?.workerSeenAt),count=s.expected===null?'확인 중':String(s.expected);
  return `<article class="upload-project" data-upload-project="${esc(p.id)}"><div class="upload-project-head"><div><h3>${esc(p.name)}</h3><p>${p.nextSlot?'다음 배정 '+esc(p.nextSlot):'선택 날짜의 후속 배정 없음'}${worker?' · 자동화 최근 확인 '+esc(worker):''}</p></div><div class="upload-progress"><strong>${s.published}</strong><span> / ${count}</span><small>게시 확인</small></div></div><div class="upload-summary"><span>진행·게시 대기 <b>${s.inProgress}</b></span><span>예정 <b>${s.scheduled}</b></span><span class="${s.attention?'upload-attention':''}">확인 필요 <b>${s.attention}</b></span></div>${p.errors.length?`<p class="upload-source-error" role="status">${p.errors.map(esc).join(' ')}</p>`:''}${p.rows.length?`<div class="upload-table-wrap"><table class="upload-table" aria-label="${esc(p.name)} ${esc(day)} 업로드"><thead><tr><th scope="col">예정 시각 · 주제</th>${p.channels.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${p.rows.map(row=>`<tr data-upload-row="${esc(row.key)}"><th scope="row"><div class="upload-slot-time">${row.date!==day?esc(row.date.slice(5))+' ':''}${esc(row.hour)}${row.wave>1?` <small>${row.wave}차</small>`:''}${!row.planned?'<span class="upload-retained">기존 기록</span>':''}</div><span class="upload-topic">${esc(row.title)}</span></th>${p.channels.map(c=>renderCell(p,row,c)).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="upload-empty">이 날짜에 배정되거나 확인된 게시가 없습니다.</p>'}</article>`;
 }).join('');
}
async function refresh(){
 if(!active()||!allowed()||loading===generation)return;
 const version=generation,requestedDay=day;loading=version;
 try{
  let value;
  if(OpsAuth.local){const response=await fetch('/api/publication-checklist?date='+encodeURIComponent(day),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('업로드 기록을 조회하지 못했습니다.');value=await response.json();}
  else value=await ProjectControls.request('publication-checklist',{date:day});
  if(version!==generation||requestedDay!==day)return;
  if(value.date!==day||!Array.isArray(value.projects))throw Error('선택한 날짜의 기록을 확인하지 못했습니다.');
  snapshot=value;error='';
 }catch(e){if(version===generation)error=e.message||'업로드 기록 연결을 확인해 주세요.';}
 finally{if(version===generation){loading=null;render();}}
}
function select(value,follow=false){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)){input.value=day;return;}generation++;day=value;followToday=follow;input.value=day;snapshot=null;error='';render();refresh();}
function visibility(){root.hidden=!active();if(active()){render();refresh();}}
root.addEventListener('change',e=>{if(e.target===input)select(input.value);});
root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-upload-refresh'))return refresh();if(b.hasAttribute('data-upload-today'))return select(today(),true);if(b.dataset.uploadShift){const d=new Date(day+'T12:00:00+09:00');d.setUTCDate(d.getUTCDate()+Number(b.dataset.uploadShift));select(dayOf(d));}});
window.addEventListener('hashchange',visibility);
window.addEventListener('ops-authenticated',()=>{cleared=false;generation++;refresh();});
window.addEventListener('ops-cleared',()=>{cleared=true;generation++;snapshot=null;error='';projects.replaceChildren();notice.textContent='관리자 로그인 후 업로드 기록을 표시합니다.';});
document.getElementById('refresh')?.addEventListener('click',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(followToday&&today()!==day)return select(today(),true);refresh();},15000);
visibility();
})();
