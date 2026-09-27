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
  function render() {
    const host=document.getElementById('searchProgress');if(!host)return;
    const regions=Array.isArray(data?.regions)?data.regions:[];
    if(!regions.some(r=>r.name===selected))selected=data?.region||regions[0]?.name||'';
    const current=regions.find(r=>r.name===selected);
    const elapsed=data?.updated_at?Math.max(0,(Date.now()-new Date(data.updated_at).getTime())/1000):Infinity;
    const stale=elapsed>180;
    const phases={initializing:'준비',search:'검색',observe:'채널 관측',region_complete:'지역 분류 완료',complete:'전체 작업 완료'};
    const status={pending:'대기',running:'검색 중',completed:'검색 완료',error:'오류'};
    const banner=!data?'진행 정보 대기':failed?'갱신 실패 · 마지막 기록 표시':data.phase==='complete'?'작업 종료':stale?'갱신 지연 · 실행 상태 확인 필요':`${data.region||''} · ${phases[data.phase]||'진행 중'}`;
    Momentum.setHTML(host,`<div class="search-progress-heading"><div><h3>서치 진행 상황</h3><p>다음 정기 서치 <strong>${e(date(nextSearch()))}</strong> · 매주 일요일 23:00 KST</p></div><button type="button" id="refreshSearchProgress">새로고침</button></div>
      <p class="search-live-state ${stale?'is-stale':''}" role="status">${e(banner)}${data?.updated_at?` · 서버 갱신 ${e(date(data.updated_at))}`:''}</p>
      <div class="search-live-metrics"><span>검색 완료 <b>${n(data?.queries_completed)}/${n(data?.queries_total)||429}</b></span><span>발견 채널 <b>${n(data?.channels_discovered).toLocaleString()}</b></span><span>관측 완료 <b>${n(data?.channels_observed).toLocaleString()}</b></span><span>검색 오류 <b>${Object.keys(data?.query_errors||{}).length}</b></span></div>
      <p class="search-progress-note">30초마다 자동 확인 · 서버는 처리 진행 시 약 1분 간격으로 기록합니다. 지역 완료 후 즉시 분류·발송대기를 갱신합니다. 예약은 실행 지연 또는 시스템 정지 시 달라질 수 있습니다.</p>
      <div class="search-region-grid">${regions.map(r=>`<button type="button" class="search-region ${r.name===selected?'selected':''}" data-search-region="${e(r.name)}" aria-pressed="${r.name===selected}"><strong>${e(r.name)}</strong><span>${n(r.queries_completed)}/${n(r.queries_total)} 검색${r.classified_at?' · 분류 완료':''}</span><progress max="${n(r.queries_total)||39}" value="${n(r.queries_completed)}" aria-label="${e(r.name)} 검색 진행률"></progress><small>관측 ${n(r.observed)}/${n(r.channels)} · 오류 ${n(r.observation_errors)}</small></button>`).join('')}</div>
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
