/* Presentation only: delivery, prospecting and telemetry contracts remain unchanged. */
const workspaceEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deliveryLabels = {ALL:'전체',SENT:'발송 처리',READY:'발송 대기',BOUNCED:'반송',REVIEW:'검토',EXCLUDED:'제외'};
const reactionLabels = {ALL:'모든 반응',OPENED_ALL:'메일 열람',OPENED_ONLY:'메일만 열람',UNOPENED:'메일 미열람',VISITED:'사이트 방문',HOT:'상담 클릭',SCROLL_90:'90% 스크롤'};
let workspaceExtra = 'ALL';
let sentDateFrom='',sentDateTo='';
let workspaceOccupation = 'ALL';
const occupationLabels = {legal:'변호사·법률',medical:'의료',realty:'부동산',tax:'세무',edu:'교육',admin:'행정사',arch:'건축',fitness:'피트니스',vet:'수의사',labor:'노무사',car:'자동차',UNKNOWN:'미분류'};
const targetOccupation = t => String(t.category || '').trim() || 'UNKNOWN';
function occupationOptions() {
  const values = [...new Set(Object.values(targetsMap).filter(t=>t&&t.token).map(targetOccupation))];
  return '<option value="ALL">전체 직업</option>' + values.sort((a,b)=>(occupationLabels[a]||a).localeCompare(occupationLabels[b]||b,'ko')).map(value=>`<option value="${workspaceEscape(value)}" ${value===workspaceOccupation?'selected':''}>${workspaceEscape(occupationLabels[value]||value)}</option>`).join('');
}
function setMainTab(tab) {
  mainTab = tab; currentFilter = 'ALL'; workspaceExtra = 'ALL'; workspaceOccupation = 'ALL';
  document.getElementById('searchInput').value = '';
  updateFilterBar(); renderTable();
  if(tab==='CONTENT')MomentumContent.open();
}
function setFilter(filter) { currentFilter = filter; updateFilterBar(); renderTable(); }
function resetWorkspaceFilters() { sentDateFrom='';sentDateTo='';setMainTab(mainTab==='INBOUND'||mainTab==='SEARCH_DB'?mainTab:'SENT'); }
function workspaceOptions(options, selected) {
  return Object.entries(options).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
}
function updateFilterBar() {
  const inbound = mainTab === 'INBOUND', prospect = mainTab === 'SEARCH_DB', content = mainTab === 'CONTENT';
  document.getElementById('contentWorkspace').hidden = !content;
  document.getElementById('tabBtnContent').classList.toggle('active',content);
  document.getElementById('resultSummary').hidden = content;
  document.getElementById('workspaceTargets').classList.toggle('active',!inbound&&!prospect&&!content);
  document.getElementById('tabBtnInbound').classList.toggle('active',inbound);
  document.getElementById('tabBtnSearchDB').classList.toggle('active',prospect);
  document.querySelector('.dashboard-body .panel-title span').textContent = content?'콘텐츠 관리':inbound?'유입 분석':prospect?'발굴 현황':'타깃 관리';
  document.getElementById('pseoAnalyticsPanel').hidden = !inbound;
  document.getElementById('prospectSummary').hidden = !prospect;
  document.getElementById('searchProgress').hidden = !prospect;
  document.querySelector('.table-controls').hidden = prospect||content;
  document.getElementById('workspaceTable').classList.toggle('workspace-hidden',prospect||content);
  document.getElementById('mobileCardsContainer').classList.toggle('workspace-hidden',prospect||content);
  const activeKpi = mainTab === 'READY' ? 'READY' : mainTab === 'SENT' ? (currentFilter === 'ALL' ? 'SENT_ALL' : currentFilter) : '';
  document.querySelectorAll('.kpi-card').forEach(card => card.classList.toggle('active-kpi', card.id === 'kpiCard_' + activeKpi));
  const filters = inbound
    ? `<label>유입 경로<select id="reactionFilter">${workspaceOptions({ALL:'전체 유입',SEO:'검색',PSEO:'지역·업종',GEO:'AI 추천',AEO:'AI 답변',SNS:'소셜',DIRECT:'직접 방문',HOT:'상담 클릭'},currentFilter)}</select></label>`
    : `<label>발송 상태<select id="deliveryFilter">${workspaceOptions(deliveryLabels,mainTab)}</select></label><label>고객 반응<select id="reactionFilter">${workspaceOptions(reactionLabels,currentFilter)}</select></label><label>직업<select id="occupationFilter">${occupationOptions()}</select></label><label>추가 조건<select id="extraFilter">${workspaceOptions({ALL:'전체',JOB:'채용공고 타깃',ZONE_A:'경기 남부',ZONE_B:'서울·판교'},workspaceExtra)}</select></label>`;
  Momentum.setHTML(document.getElementById('dynamicFilterGroup'),filters+(!inbound?`<label>발송일 시작<input type="date" id="sentDateFrom" value="${workspaceEscape(sentDateFrom)}"></label><label>발송일 종료<input type="date" id="sentDateTo" value="${workspaceEscape(sentDateTo)}"></label><button type="button" id="sentDateToday">오늘</button><button type="button" id="sentDateClear">날짜 해제</button>`:''));
}
function workspaceReaction(s) {
  return currentFilter==='ALL' || (currentFilter==='OPENED_ALL'&&s.opened) || (currentFilter==='OPENED_ONLY'&&s.opened&&!s.visited) || (currentFilter==='UNOPENED'&&!s.opened) || (currentFilter==='VISITED'&&s.visited) || (currentFilter==='HOT'&&s.hot) || (currentFilter==='SCROLL_90'&&s.maxScroll>=90);
}
function workspaceStatus(t) {
  const label = t.status==='SENT'?'발송 완료':deliveryLabels[t.status]||t.status||'확인 필요';
  return `<span class="status-pill status-${workspaceEscape(t.status)}">${workspaceEscape(label)}</span>`;
}
function youtubeChannelButton(target) {
  try {
    const url = new URL(target.channel_url || '');
    if (url.protocol !== 'https:' || !['youtube.com','www.youtube.com'].includes(url.hostname) || url.username || url.password || url.port) return '';
    if (!/^\/(?:channel\/UC[A-Za-z0-9_-]{22}|@[A-Za-z0-9_.%\-가-힣]+|(?:c|user)\/[A-Za-z0-9_.%\-가-힣]+)\/?$/.test(url.pathname)) return '';
    url.search='';url.hash='';
    return `<a class="youtube-channel-link" href="${workspaceEscape(url.href)}" target="_blank" rel="noopener noreferrer" aria-label="${workspaceEscape(target.company || '업체')} 유튜브 채널 새 탭에서 열기">유튜브 ↗</a>`;
  } catch (_) { return ''; }
}
function prospectScoreBadge(t, detail=false) {
  const n=Number(t.prospect_score), e=workspaceEscape;
  if(t.prospect_score==null || t.prospect_score==='' || !Number.isFinite(n)) return '<span class="prospect-score">점수 미확인</span>';
  let snapshot={};try{snapshot=JSON.parse(t.score_snapshot||'{}');}catch(_){}
  const c=snapshot.score_components||{};
  const breakdown=detail?`<p class="score-breakdown">활동성 ${e(c.activity??'—')} · 제작량 ${e(c.production??'—')} · 조회수 ${e(c.performance??'—')} · 감점 −${e(snapshot.score_penalty??0)}<br>최근 롱폼 ${e(snapshot.sample_size??'—')}편 중앙값 ${e(snapshot.recent_longform_median??'—')}회</p>`:'';
  return `<span class="prospect-score"><strong>${e(n)}점</strong> · ${e(t.prospect_grade||'UNSCORED')}</span>${breakdown}`;
}
function activateYoutubeLinks(container) {
  container.querySelectorAll('a.youtube-channel-link').forEach(link=>{
    link.target='_blank';link.rel='noopener noreferrer';
  });
}
function renderTable() {
  updateFilterBar();
  if(mainTab==='CONTENT')return;
  const e=workspaceEscape, inbound=mainTab==='INBOUND', prospect=mainTab==='SEARCH_DB';
  const summary=document.getElementById('resultSummary');
  if(prospect) {
    const s=targetsMap._search_db_stats||{}, actualTargets=Object.values(targetsMap).filter(t=>t&&t.token);
    const ready=actualTargets.length?actualTargets.filter(t=>t.status==='READY').length:(s.ready_count??0);
    const total=Number(s.total_candidates)||0;
    const percent=count=>total>0?((Number(count)||0)/total*100).toFixed(1)+'%':'0.0%';
    const definitions=[['검색 후보 누적',s.total_candidates??0,'지역·업종 검색에 등장한 중복 제거 채널입니다. 조건 통과 수와 다릅니다.'],['분류 대기',s.discovered_count??0,'전체 조건 검증과 등록을 기다리는 후보입니다.'],['정보 부족',s.review_count??0,s.schema_version>=2?'확정 탈락 사유 없이 필수 근거가 부족한 후보입니다.':'구버전 집계로 조건 탈락과 정보 부족이 혼재합니다.'],['조건 탈락',s.rejected_count,'제외 업종 또는 최근 롱폼 10편 중앙값 1,000회 이상인 후보입니다. 실제 전체 롱폼이 10편 미만이면 조회수 조건은 예외입니다.'],['수집 오류',s.error_count,'외부 정보 수집 또는 처리 실패입니다. 부적격과 구별합니다.'],['중복 제외',s.duplicate_count,'기존 등록 대상과 이메일·채널·업체가 중복됩니다.'],['발송 DB 등록 이력',s.registered_count??s.verified_count??0,'발송 완료 대상도 포함한 등록 이력입니다. 현재 잔량과 다릅니다.'],['현재 발송 대기',ready,'전체 조건 검증 후 현재 발송을 기다리는 실제 잔량입니다.']];
    Momentum.setHTML(document.getElementById('prospectSummary'),definitions.map(([label,count,desc])=>`<article class="prospect-card"><span>${label}</span><strong>${count==null?'—':e(count)}</strong>${label==='현재 발송 대기'?'':`<small class="field-label">${count==null?'구버전 집계 없음':'검색 후보 대비 '+percent(count)}</small>`}<details><summary>기준 보기</summary><p>${e(desc)}</p></details></article>`).join(''));
    summary.textContent='검색 후보·검증 상태·현재 발송 잔량을 구분해 표시합니다.'+(s.schema_version>=2?'':' 구버전 집계: 정보 부족과 조건 탈락이 혼재할 수 있습니다.');
    if(s.sweep?.sweep_id) summary.textContent+=` 전수 검색 ${Number(s.sweep.queries_completed)||0}/${Number(s.sweep.queries_total)||440} · 관측 ${Number(s.sweep.channels_observed)||0}/${Number(s.sweep.channels_discovered)||0} · ${s.sweep.status==='COMPLETED'?'완료':s.sweep.status==='COMPLETED_WITH_ERRORS'?'완료(관측 오류 있음)':'진행/재개 대기'}`;
    return;
  }
  const stats=Momentum.aggregateStats(targetsMap,liveEvents), query=document.getElementById('searchInput').value.trim().toLowerCase();
  let rows=inbound?getInboundList():Object.values(targetsMap).filter(t=>t&&t.token);
  rows=rows.filter(t=>{
    const s=stats[t.token]||{};
    if(inbound) {if(currentFilter==='HOT'?!t.hot:currentFilter!=='ALL'&&t.channel_type!==currentFilter)return false;}
    else {
      if(mainTab==='SENT'?!['SENT','BOUNCED'].includes(t.status):mainTab!=='ALL'&&t.status!==mainTab)return false;
      if(!workspaceReaction(s))return false;
      const sentDate=(t.sent_at||'').slice(0,10);
      if((sentDateFrom||sentDateTo)&&(!/^\d{4}-\d{2}-\d{2}$/.test(sentDate)||(sentDateFrom&&sentDate<sentDateFrom)||(sentDateTo&&sentDate>sentDateTo)))return false;
      if(workspaceOccupation!=='ALL'&&targetOccupation(t)!==workspaceOccupation)return false;
      if(workspaceExtra==='JOB'&&!isJobPostingTarget(t))return false;
      const zoneB=['서울','강남','서초','송파','판교','분당'].some(k=>(t.region||'').includes(k));
      if(workspaceExtra==='ZONE_B'&&!zoneB||workspaceExtra==='ZONE_A'&&zoneB)return false;
    }
    return !query||[t.company,t.rep,t.email,t.token,t.region,t.category,t.channel_name,t.ref_url].join(' ').toLowerCase().includes(query);
  });
  const sentTime=t=>Date.parse((t.sent_at||'').replace(/ \(.+\)/,''))||0;
  rows.sort((a,b)=>inbound?b.lastSeen-a.lastSeen:mainTab==='READY'?((Number(b.prospect_score||-1)-Number(a.prospect_score||-1))||Number(a.no)-Number(b.no)):(sentTime(b)-sentTime(a)||Number(b.no)-Number(a.no)));
  summary.textContent=`${inbound?'유입':deliveryLabels[mainTab]||'타깃'} · ${inbound?'':(reactionLabels[currentFilter]||'')+' · '}${rows.length}건${!inbound&&workspaceOccupation!=='ALL'?' · 직업: '+(occupationLabels[workspaceOccupation]||workspaceOccupation):''}${query?' · 검색: '+query:''}`;
  const heads=inbound?['유입 경로','최근 방문','탐색 반응','기기']:['업체 / 담당자','발송 상태','메일 열람','사이트 방문','최근 활동'];
  Momentum.setHTML(document.getElementById('tableHead'),'<tr>'+heads.map(h=>`<th>${h}</th>`).join('')+'</tr>');
  const cells=t=>{
    const s=stats[t.token]||{}, open=Number(s.openCount)||0,visit=Number(s.visitCount)||0;
    const button=`<button class="target-link" data-detail-token="${e(t.token)}">${e(inbound?t.channel_name:t.company)}</button>`;
    if(inbound)return [button+youtubeChannelButton(t)+prospectScoreBadge(t)+`<small>${e(t.channel_type)}</small>`,e(formatRelativeTime(t.lastSeen)),`${t.hot?'<span class="status-pill status-READY">상담 클릭</span>':''}<small>스크롤 ${e(t.maxScroll)}% · ${e(t.maxStaySec)}초</small>`,e(t.device)];
    return [button+youtubeChannelButton(t)+prospectScoreBadge(t)+`<small>${e([t.rep,t.region,t.category].filter(Boolean).join(' · '))}</small>`,workspaceStatus(t)+excludeTargetButton(t)+`<small>${e(t.sent_at||'')}</small>`,`<span class="metric ${open?'metric-open':''}">${open}회</span>`,`<span class="metric ${visit?'metric-visit':''}">${visit}회</span>`,`${s.hot?'<span class="status-pill status-READY">상담 클릭</span>':''}<small>${e(s.lastSeen?formatRelativeTime(s.lastSeen):'활동 없음')}</small>`];
  };
  Momentum.setHTML(document.getElementById('tableBody'),rows.length?rows.map(t=>'<tr>'+cells(t).map(c=>`<td>${c}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${heads.length}" class="workspace-empty">조건에 일치하는 ${inbound?'방문':'타깃'}이 없습니다.</td></tr>`);
  Momentum.setHTML(document.getElementById('mobileCardsContainer'),rows.length?rows.map(t=>{const c=cells(t);return `<article class="target-card"><div class="compact-card-heading">${c[0]}</div><div class="compact-card-grid">${c.slice(1).map((v,i)=>`<div><span class="field-label">${heads[i+1]}</span>${v}</div>`).join('')}</div></article>`;}).join(''):'<div class="workspace-empty">조건에 일치하는 항목이 없습니다.</div>');
  activateYoutubeLinks(document.getElementById('tableBody'));
  activateYoutubeLinks(document.getElementById('mobileCardsContainer'));
}
function customerVisitHistory(events) {
  const e=workspaceEscape;
  const visits=events.filter(ev=>['visit','view'].includes(ev.event));
  const stamp=ev=>new Date(ev.timestamp).toLocaleString('ko-KR');
  const price=ev=>{
    const raw=ev.meta.applied_pricing||ev.pricing_tier||ev.meta.pricing||'';
    return /OUTBOUND|VIP/i.test(raw)?'제휴가 · 50 / 280 / 360만 원':/INBOUND_PUBLIC/i.test(raw)?'정상가 · 60 / 320 / 400만 원':'미기록';
  };
  const clicks=events.filter(ev=>ev.event==='kakao_click');
  return `<section class="customer-visits"><h3>방문 기록</h3><dl><div><dt>첫 방문</dt><dd>${visits.length?e(stamp(visits[visits.length-1])):'기록 없음'}</dd></div><div><dt>최근 방문</dt><dd>${visits.length?e(stamp(visits[0])):'기록 없음'}</dd></div><div><dt>상담 클릭</dt><dd>${clicks.length}회${clicks.length?' · 최근 '+e(stamp(clicks[0])):''}</dd></div><div><dt>최근 적용 가격</dt><dd>${visits.length?e(price(visits[0])):'미기록'}</dd></div></dl><p class="field-label">고객사 전용 링크 또는 그 방문 이력에 연결된 기록입니다. 링크 전달·공용 기기 사용 시 실제 방문자가 다를 수 있습니다. 상담 클릭은 상담 완료가 아닙니다.</p><ol class="visit-cards">${visits.map(ev=>{
    const related=ev.meta.visit_id?events.filter(x=>x.meta.visit_id===ev.meta.visit_id):[];
    const clicked=related.some(x=>x.event==='kakao_click');
    return `<li><time>${e(stamp(ev))}</time><strong>${e(ev.meta.arrival_source||'과거 기록 · 유입 경로 미분리')}</strong><span>${e(price(ev))}</span><span>연결 기준: ${e(ev.meta.attribution_basis||'기존 추적 토큰')}</span><span>${e(ev.device||'기기 미기록')} · ${e(ev.path||'/')}</span><span>${ev.meta.visit_id?(clicked?'상담 버튼 클릭 있음':'상담 클릭 기록 없음'):'방문별 상담 연결 미기록'}</span></li>`;
  }).join('')||'<li>동기화된 방문 상세 기록이 없습니다.</li>'}</ol><p class="field-label">새 유입 경로 구분은 업데이트 이후 기록부터 제공됩니다. 직접 접속과 출처가 전달되지 않은 방문은 구분할 수 없습니다.</p></section>`;
}
function openTargetDetail(token) {
  const t=targetsMap[token]||getInboundList().find(t=>t.token===token);if(!t)return;
  const e=workspaceEscape,s=Momentum.aggregateStats(targetsMap,liveEvents)[token]||{};
  document.getElementById('detailTitle').textContent=t.company||t.channel_name||'방문 상세';
  const facts=t.company?[['담당자',t.rep],['이메일',t.email],['업종 / 지역',[t.category,t.region].filter(Boolean).join(' / ')],['발송 상태',t.status==='SENT'?'발송 완료':deliveryLabels[t.status]||t.status],['발송일시',t.sent_at],['영업 포인트',t.point||t.views],['채널',t.channel_url||t.channel],['추적 토큰',token]]:[['유입 경로',t.channel_name],['기기',t.device],['유입 주소',t.ref_url],['세션',token]];
  const names={email_open:'메일 열람',open:'메일 열람',visit:'사이트 방문',view:'페이지 조회',scroll_50:'50% 스크롤',scroll_90:'90% 스크롤',kakao_click:'카카오톡 상담 클릭',cta_click:'버튼 클릭',payment_attempt:'결제 시도',pay_modal_open:'결제창 열기',roi_calc_change:'계산기 사용',leave:'페이지 떠남',pay_and_kakao_connect:'결제·상담 연결 클릭'};
  const events=Momentum.mergeEvents(liveEvents).filter(ev=>ev.ref===token&&!Momentum.isTestEvent(ev));
  Momentum.setHTML(document.getElementById('detailBody'),`${youtubeChannelButton(t)}${excludeTargetButton(t)}${prospectScoreBadge(t,true)}<dl>${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${e(v||'—')}</dd></div>`).join('')}</dl><div class="detail-metrics"><span>메일 열람 <strong>${Number(s.openCount)||0}회</strong></span><span>사이트 방문 <strong>${Number(s.visitCount)||0}회</strong></span><span>스크롤 <strong>${Number(s.maxScroll)||t.maxScroll||0}%</strong></span><span>체류 <strong>${Number(s.maxStaySec)||t.maxStaySec||0}초</strong></span></div>${customerVisitHistory(events)}<h3>활동 이력</h3><p class="field-label">현재 동기화된 기록 기준 · 메일 열람은 추적 이미지 요청 기준</p><ol class="detail-events">${events.map(ev=>`<li><span>${e(names[ev.event]||(/^duration_/.test(ev.event)?'체류 기록':ev.event))}</span><time>${e(new Date(ev.timestamp).toLocaleString('ko-KR'))}</time></li>`).join('')||'<li>동기화된 상세 활동 기록이 없습니다.</li>'}</ol>`);
  activateYoutubeLinks(document.getElementById('detailBody'));
  document.getElementById('targetDetail').showModal();
}
document.addEventListener('click',ev=>{const button=ev.target.closest('[data-detail-token]');if(button)openTargetDetail(button.dataset.detailToken);});
document.getElementById('targetDetail').addEventListener('click',ev=>{if(ev.target===ev.currentTarget){const r=ev.currentTarget.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)ev.currentTarget.close();}});
document.addEventListener('change',ev=>{
  if(ev.target.id==='sentDateFrom'){sentDateFrom=ev.target.value;if(sentDateTo&&sentDateFrom>sentDateTo)sentDateTo=sentDateFrom;renderTable();}
  if(ev.target.id==='sentDateTo'){sentDateTo=ev.target.value;if(sentDateFrom&&sentDateTo&&sentDateTo<sentDateFrom)sentDateFrom=sentDateTo;renderTable();}
  if(ev.target.id==='deliveryFilter')setMainTab(ev.target.value);
  if(ev.target.id==='reactionFilter')setFilter(ev.target.value);
  if(ev.target.id==='occupationFilter'){workspaceOccupation=ev.target.value;renderTable();}
  if(ev.target.id==='extraFilter'){workspaceExtra=ev.target.value;renderTable();}
});

document.addEventListener('click',ev=>{
  const region=ev.target.closest('[data-pseo-region]'),industry=ev.target.closest('[data-pseo-industry]');
  if(region)filterByPseoRegion(region.dataset.pseoRegion);
  if(industry)filterByPseoIndustry(industry.dataset.pseoIndustry);
});
document.addEventListener('keydown',ev=>{
  if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches('[role="button"]')){ev.preventDefault();ev.target.click();}
});

let permanentExclusions = {};
function excludeTargetButton(t) {
  return t.status==='READY'?`<button type="button" class="exclude-target-button" data-exclude-token="${workspaceEscape(t.token)}">영구 제외</button>`:'';
}
function applyPermanentExclusions() {
  const entries=Object.entries(permanentExclusions);
  for(const t of Object.values(targetsMap)) {
    if(!t||!['READY','REVIEW'].includes(t.status))continue;
    if(entries.some(([token,x])=>token===t.token||(x.channel_url&&x.channel_url===(t.channel_url||'').replace(/\/$/,''))||(x.email&&x.email===(t.email||'').trim().toLowerCase())))t.status='EXCLUDED';
  }
}
async function refreshPermanentExclusions() {
  const result=await MomentumAdmin.call('targets.exclusions');
  permanentExclusions=result.entries||{};applyPermanentExclusions();
}
let exclusionPending=false;
document.addEventListener('click',async ev=>{
  const button=ev.target.closest('[data-exclude-token]');if(!button||exclusionPending)return;
  const token=button.dataset.excludeToken,t=targetsMap[token];if(!t||t.status!=='READY')return;
  if(!confirm(`${t.company}을(를) 영구 제외할까요?\n발송대기에서 빠지고 같은 유튜브 채널·이메일은 이후 서치와 분류에서도 다시 발송대기로 등록되지 않습니다.\n이력은 ‘제외’ 목록에 보존됩니다.`))return;
  exclusionPending=true;button.disabled=true;button.textContent='제외 저장 중…';
  try {
    const result=await MomentumAdmin.call('targets.exclude',{token});
    permanentExclusions=result.entries||{};applyPermanentExclusions();
    document.getElementById('targetDetail').close();updateKPIs();renderTable();
  } catch(error) {
    // A lost response may still have committed. Read back; never repeat a write automatically.
    try {await refreshPermanentExclusions();}catch(_){}
    if(targetsMap[token]?.status==='EXCLUDED'){updateKPIs();renderTable();}
    else {alert(error.message+'\n제외 완료가 확인되지 않았습니다. 목록을 새로고침한 후 확인해 주세요.');button.disabled=false;button.textContent='영구 제외';}
  } finally {exclusionPending=false;}
});

document.addEventListener('click',ev=>{
  if(ev.target.closest('#sentDateToday')){sentDateFrom=sentDateTo=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});setMainTab('SENT');}
  if(ev.target.closest('#sentDateClear')){sentDateFrom='';sentDateTo='';renderTable();}
});
