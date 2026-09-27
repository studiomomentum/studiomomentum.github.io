/* Public aggregate progress only; credentials and channel evidence stay server-side. */
(() => {
  const endpoint='https://raw.githubusercontent.com/studiomomentum/studiomomentum.github.io/main/search-progress.json';
  let data=null,selected='',loading=false,failed=false;
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=value=>Number.isFinite(Number(value))?Number(value):0;
  const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  function nextSearch(now=new Date()) {
    const next=new Date(now);next.setUTCHours(14,0,0,0);
    next.setUTCDate(next.getUTCDate()+(7-next.getUTCDay())%7);
    if(next<=now)next.setUTCDate(next.getUTCDate()+7);
    return next;
  }
  function activeLabel(t) {
    const fallback=typeof targetsMap!=='undefined'?targetsMap._classification_context?.[t.channel_id]:'';
    const query=String(t.query||fallback||'').trim();
    const parts=query.split(/\s+/),region=parts.shift(),profession=parts.join(' ');
    return `<li><strong>${e(region||'지역 미확인')} · ${e(profession||'직업 미확인')}</strong><span>${e(t.name||t.channel_id||'채널 미확인')}</span></li>`;
  }
  function render() {
    const host=document.getElementById('searchProgress');if(!host)return;
    const regions=Array.isArray(data?.regions)?data.regions:[];
    if(!regions.some(r=>r.name===selected))selected=data?.region||regions[0]?.name||'';
    const current=regions.find(r=>r.name===selected);
    const elapsed=data?.updated_at?Math.max(0,(Date.now()-new Date(data.updated_at).getTime())/1000):Infinity;
    const stale=elapsed>180;
    const phases={initializing:'준비',search:'검색',observe:'채널 관측',region_complete:'지역 분류 완료',complete:'전체 작업 완료'};
    const status={pending:'대기',running:'검색 중',completed:'검색 완료',error:'오류'};
    const stageLabels={starting:'준비',running:'진행 중',waiting:'새 후보 대기',complete:'완료',incomplete:'중단·미완료',not_running:'미실행'};
    const classification=data?.classification||{}, searchStage=data?.search_stage||{};
    const banner=!data?'진행 정보 대기':failed?'갱신 실패 · 마지막 기록 표시':data.phase==='complete'?'작업 종료':stale?'갱신 지연 · 실행 상태 확인 필요':`${searchStage.region||data.region||''} · ${stageLabels[searchStage.status]||phases[data.phase]||'진행 중'}`;
    Momentum.setHTML(host,`<div class="search-progress-heading"><div><h3>서치 진행 상황</h3><p>다음 정기 서치 <strong>${e(date(nextSearch()))}</strong> · 매주 일요일 23:00 KST</p></div><button type="button" id="refreshSearchProgress">새로고침</button></div>
      <p class="search-live-state ${stale?'is-stale':''}" role="status">${e(banner)}${data?.updated_at?` · 서버 갱신 ${e(date(data.updated_at))}`:''}</p>
      <div class="search-live-metrics"><span>검색 완료 <b>${n(data?.queries_completed)}/${n(data?.queries_total)||429}</b></span><span>발견 채널 <b>${n(data?.channels_discovered).toLocaleString()}</b></span><span>검색 오류 <b>${Object.keys(data?.query_errors||{}).length}</b></span></div>
      <p class="search-progress-note">30초마다 자동 확인 · 서버는 처리 진행 시 약 1분 간격으로 기록합니다. 서치와 분류는 독립 실행되며 분류 결과를 수시로 발송대기에 반영합니다. 예약은 실행 지연 또는 시스템 정지 시 달라질 수 있습니다.</p>
      <section class="classification-progress" aria-label="분류 진행 상황"><h3>분류 진행 상황 <small>${e(stageLabels[classification.status]||'기록 대기')}</small></h3>
        <p>처리 완료 <strong>${n(classification.processed).toLocaleString()} / ${n(classification.total).toLocaleString()}</strong> · ${classification.total?Math.min(100,n(classification.processed)/n(classification.total)*100).toFixed(1):'0.0'}%</p>
        <progress max="${n(classification.total)||1}" value="${n(classification.processed)}" aria-label="전체 분류 진행률"></progress>
        <div class="classification-metrics">${[['대기',classification.pending],['처리 중',classification.processing],['조건 통과',classification.eligible],['정보 부족·보류',classification.review],['조건 탈락',classification.rejected],['수집·분류 오류',classification.errors],['현재 발송대기',classification.ready]].map(([label,count])=>`<article><span>${e(label)}</span><strong>${n(count).toLocaleString()}</strong></article>`).join('')}</div>
        <div class="classification-active"><strong>현재 처리 · 검색 지역 / 직업</strong><ul>${Array.isArray(classification.active)&&classification.active.length?classification.active.map(activeLabel).join(''):'<li>처리 중인 후보 없음</li>'}</ul></div>
        <p class="search-progress-note">지역·직업은 후보를 발견한 검색어 기준이며, 실제 소재지는 분류에서 별도로 확인합니다. 후보는 발견 순서에 따라 병렬 처리하므로 한 지역의 직업을 순차 완료하는 표시는 아닙니다. 조회수·점수·소재지·이메일을 확인합니다. 조건 통과에는 기존 등록 후보도 포함되며, 중복·발송 이력 확인 후 실제 발송대기를 갱신합니다. 서치에서 후보가 추가되면 전체 대상 수가 늘어납니다.</p></section>
      <div class="search-region-grid">${regions.map(r=>`<button type="button" class="search-region ${r.name===selected?'selected':''}" data-search-region="${e(r.name)}" aria-pressed="${r.name===selected}"><strong>${e(r.name)}</strong><span>${n(r.queries_completed)}/${n(r.queries_total)} 검색${r.classified_at?' · 분류 완료':''}</span><progress max="${n(r.queries_total)||39}" value="${n(r.queries_completed)}" aria-label="${e(r.name)} 검색 진행률"></progress><small>분류 ${n(r.classified??r.observed)}/${n(r.channels)} · 오류 ${n(r.classification_errors??r.observation_errors)}</small></button>`).join('')}</div>
      ${current?`<h4>${e(selected)} · 업종별 검색 진행</h4><div class="search-job-grid">${(current.jobs||[]).map(j=>`<article class="search-job ${e(j.status)}"><strong>${e(j.name)}</strong><span>${e(status[j.status]||'대기')}</span><small>채널 ${n(j.channels)} · 검색 결과 ${n(j.results_read)}</small></article>`).join('')}</div>`:''}`);
    host.querySelector('#refreshSearchProgress')?.addEventListener('click',refresh);
    host.querySelectorAll('[data-search-region]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.searchRegion;render();}));
  }
  async function refresh() {
    if(loading)return;loading=true;
    try {
      const response=await fetch(endpoint+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('progress unavailable');
      const value=await response.json();
      if(!value || !Array.isArray(value.regions) || !value.updated_at)throw new Error('invalid progress');
      data=value;failed=false;
    } catch(_){failed=true;} finally {loading=false;render();}
  }
  render();refresh();
  setInterval(()=>{if(!document.hidden)refresh();},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
