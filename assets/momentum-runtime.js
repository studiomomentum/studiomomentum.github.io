/* Shared data contracts; no network writes occur on import. */
(function () {
  'use strict';
  const allowed = /^(visit|view|email_open|open|scroll_50|scroll_90|duration_\d+s|leave|engagement|cta_click|kakao_click|roi_calc_change|pay_and_kakao_connect|payment_attempt|pay_modal_open)$/;
  function eventKey(ev) {
    return ev.event_id || ev.id || ev._msg_id || ev._id || [ev.time || ev.timestamp, ev.ref, ev.event].join('_');
  }
  // Legacy ko-KR strings were written in Korea time, independent of the viewer timezone.
  function parseTimestamp(input) {
    if (input == null || input === '' || typeof input === 'boolean') return 0;
    let stamp = 0;
    if (typeof input === 'number' || (typeof input === 'string' && /^\d+(?:\.\d+)?$/.test(input.trim()))) {
      const n = Number(input);
      stamp = n < 1e11 ? n * 1000 : n;
    } else if (typeof input === 'string') {
      const text = input.trim();
      const ko = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
      if (ko) {
        const [, y, m, d, period, h, min, sec = '0'] = ko;
        if (+h < 1 || +h > 12 || +min > 59 || +sec > 59) return 0;
        const hour = +h % 12 + (period === '오후' ? 12 : 0);
        const local = Date.UTC(+y, +m - 1, +d, hour, +min, +sec);
        const check = new Date(local);
        if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +m - 1 || check.getUTCDate() !== +d) return 0;
        stamp = local - 9 * 3600000;
      } else if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)) {
        stamp = Date.parse(text);
      }
    }
    return Number.isFinite(stamp) && stamp >= Date.UTC(2000, 0, 1) && stamp <= 253402300799999 ? stamp : 0;
  }
  function formatEventTime(input) {
    const stamp = parseTimestamp(input);
    return stamp ? new Date(stamp).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'}) : '시각 미기록';
  }
  function normalizeEvent(ev) {
    if (!ev || typeof ev !== 'object' || !allowed.test(ev.event || '') || typeof ev.ref !== 'string') return null;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(ev.ref) || ['__proto__','constructor','prototype'].includes(ev.ref)) return null;
    const value = Object.assign({}, ev);
    value.meta = ev.meta && typeof ev.meta === 'object' ? ev.meta : {};
    value.timestamp = parseTimestamp(ev.timestamp) || parseTimestamp(ev.time) || parseTimestamp(ev._received);
    if ('_received' in value) value._received = parseTimestamp(ev._received);
    if (isTestEvent(value)) {value.is_test=true;}
    value._id = eventKey(ev);
    return value;
  }
  function mergeEvents(...groups) {
    const seen = new Set();
    return groups.flat().map(normalizeEvent).filter(ev => {
      if (!ev) return false;
      const key = eventKey(ev);
      const legacy = ['legacy', ev.timestamp, ev.ref, ev.event].join('_');
      const useLegacy = !ev.event_id && ev.timestamp > 0;
      if (seen.has(key) || (useLegacy && seen.has(legacy))) return false;
      seen.add(key); if (useLegacy) seen.add(legacy); return true;
    }).sort((a,b) => b.timestamp-a.timestamp);
  }
  function unpersistedEvents(events, persisted) {
    const keys = ev => {
      const values = [ev.event_id, ev._msg_id, ev.id, ev._id].filter(Boolean).map(String);
      if (ev.timestamp > 0) values.push([ev.timestamp, ev.ref, ev.event].join('_'));
      return values;
    };
    const seen = new Set(mergeEvents(persisted).flatMap(keys));
    return mergeEvents(events).filter(ev => {
      if (isTestEvent(ev)) return false;
      const identities = keys(ev);
      if (!identities.length || identities.some(key => seen.has(key))) return false;
      identities.forEach(key => seen.add(key));
      return true;
    });
  }
  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function setHTML(el, markup) {
    if (!el) return;
    if (!window.DOMPurify) throw new Error('HTML sanitizer unavailable');
    // Parse fragments in their destination context so table rows/cells survive.
    // Sanitize the detached node before attaching any of its children.
    const staging = el.cloneNode(false);
    staging.innerHTML = String(markup);
    window.DOMPurify.sanitize(staging, {USE_PROFILES: {html: true}, IN_PLACE: true});
    el.replaceChildren(...staging.childNodes);
  }
  let pageVisitId;
  function visitContext(payload) {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const explicit = ['ref','v_ref'].some(k => query.get(k) || hash.get(k)) || query.has('vip') || query.get('pricing') === 'vip' || /vip/i.test(window.location.hash);
    const source = (query.get('utm_source') || query.get('source') || query.get('src') || '').slice(0,100);
    const medium = (query.get('utm_medium') || '').slice(0,60);
    let host = '';
    try { host = new URL(document.referrer).hostname; } catch (_) {}
    let arrival = '직접 / 출처 미확인';
    if (source || medium) arrival = '캠페인: ' + (source || medium);
    else if (explicit) arrival = '제안 전용 링크';
    else if (/(^|\.)(google\.(?:com|co\.kr|co\.jp|co\.uk|de|fr|ca|com\.au)|naver.com|bing.com|search.daum.net)$/.test(host)) arrival = '검색: ' + host;
    else if (/(^|\.)(chatgpt.com|chat.openai.com|perplexity.ai|claude.ai|gemini.google.com|copilot.microsoft.com)$/.test(host)) arrival = 'AI 추천: ' + host;
    else if (host === window.location.hostname) arrival = '사이트 내부 이동';
    else if (host) arrival = '외부 링크: ' + host;
    pageVisitId = pageVisitId || (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(16).slice(2));
    return {visit_id:pageVisitId, arrival_source:arrival, arrival_host:host, utm_source:source, utm_medium:medium,
      utm_campaign:(query.get('utm_campaign') || '').slice(0,100), utm_content:(query.get('utm_content') || '').slice(0,180),
      attribution_basis:explicit ? '전용 링크' : (payload.channel_type === 'OUTBOUND' ? '이전 제안 방문 이력' : '익명 방문'),
      applied_pricing:payload.pricing_tier || (payload.meta && payload.meta.pricing) || ''};
  }
  function sendTelemetry(payload, topic, gasUrl) {
    if (isTestEvent(payload)) return Promise.resolve({skipped:true});
    const arrival = visitContext(payload);
    const identity = window.MomentumCollector ? window.MomentumCollector.context(payload, arrival) : {};
    payload.path = payload.path || window.location.pathname || '/';
    payload.meta = Object.assign({}, payload.meta || {}, arrival, identity);
    payload.event_id = payload.event_id || (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(16).slice(2));
    payload.timestamp = parseTimestamp(payload.timestamp) || parseTimestamp(payload.time) || Date.now();
    payload.time = new Date(payload.timestamp).toISOString();
    if (!normalizeEvent(payload)) return Promise.resolve({rejected:'invalid_event'});
    if (window.MomentumCollector) return window.MomentumCollector.deliver(payload, topic, gasUrl);
    const body = JSON.stringify(payload);
    const destinations = ['https://ntfy.sh/' + topic];
    if (gasUrl) destinations.push(gasUrl);
    return Promise.all(destinations.map(url => {
      const beacon = () => !!(navigator.sendBeacon && navigator.sendBeacon(url, body));
      if (!window.fetch) return Promise.resolve(beacon());
      return fetch(url, {method:'POST', body, headers:{'Content-Type':'text/plain;charset=UTF-8'}, keepalive:true, mode:url===gasUrl?'no-cors':'cors'})
        .then(res => { if (res.type !== 'opaque' && !res.ok) throw new Error('telemetry rejected'); return true; })
        .catch(() => beacon());
    })); // Transport attempt only: opaque GAS responses are not persistence acknowledgements.
  }
  // Confirmed browser verification sessions; preserve raw archive, exclude from customer metrics.
  const excludedTestSessions = new Set(["18088418-c7fb-4c8e-8eb3-112e29a950ea", "1b0b43bb-eaad-4a37-bf87-09b73a8b2f35", "5c4cdef5-e69f-489f-aa30-e080472038b2", "758aaad8-407f-43a1-8e7e-e790a13b2cf0", "9118aa5f-9090-4bd9-aa95-da26765e9e56", "c35059ff-a135-43ba-9739-c2af6b55013b", "da9e2318-1834-4470-bfd2-19fb36d29467", "e73fabf1-6857-4fb4-8f7d-05f5cfcc2fae", "fb74b0ab-c972-4230-9661-bdc2f1b36939"]);
  function isTestEvent(ev) {
    return !!(ev.is_test || excludedTestSessions.has(ev.meta?.session_id) || ev.is_admin || ev.channel_type==='ADMIN_TEST' || (ev.meta && ev.meta.is_admin) || /^(vip|test|preview|admin|dev|sample|direct|o3eltr25|momentum|vip_test)$/i.test(ev.ref||'') || /^momentum-test-/i.test(ev.ref||''));
  }
  function visitEvents(events) {
    const seen = new Set();
    return mergeEvents(events).filter(ev => {
      if (isTestEvent(ev) || !['visit','view'].includes(ev.event)) return false;
      const key = ev.meta.visit_id || eventKey(ev);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function trafficSummary(events) {
    const views=visitEvents(events), modern=mergeEvents(events).filter(ev=>!isTestEvent(ev)&&ev.meta.schema_version===2);
    return {pageViews:views.length, sessions:new Set(modern.map(ev=>ev.meta.session_id).filter(Boolean)).size,
      browserVisitors:new Set(modern.map(ev=>ev.meta.visitor_id).filter(Boolean)).size,
      legacyPageViews:views.filter(ev=>ev.meta.schema_version!==2).length};
  }
  function aggregateStats(targets, events) {
    const result = Object.create(null);
    const get = ref => result[ref] || (result[ref]={opened:false,visited:false,hot:false,kakaoClick:false,openCount:0,visitCount:0,maxScroll:0,maxStaySec:0,firstSeen:0,lastSeen:0,events:[]});
    const pageViewIds = new Set(visitEvents(events).map(eventKey));
    for (const ev of mergeEvents(events)) {
      if (isTestEvent(ev)) continue;
      const s=get(ev.ref), stamp=ev.timestamp;
      s.events.push(ev);
      if (stamp) {s.firstSeen=s.firstSeen?Math.min(s.firstSeen,stamp):stamp;s.lastSeen=Math.max(s.lastSeen,stamp);}
      if (ev.event==='email_open'||ev.event==='open') {s.opened=true;s.openCount++;}
      else {
        s.visited=true;
        if (pageViewIds.has(eventKey(ev))) s.visitCount++;
        if (['kakao_click','pay_and_kakao_connect'].includes(ev.event)) s.hot=s.kakaoClick=true;
        if (ev.event==='scroll_90') s.maxScroll=Math.max(s.maxScroll,90);
        if (ev.event==='scroll_50') s.maxScroll=Math.max(s.maxScroll,50);
        s.maxStaySec=Math.max(s.maxStaySec,Number(ev.meta.duration)||0,Number(ev.meta.totalDuration)||0,Number(ev.meta.elapsed)||0);
      }
    }
    const pageTimes = new Map();
    for (const ev of mergeEvents(events)) {
      if (isTestEvent(ev) || ev.meta.measurement !== 'visible_time_v2' || !ev.meta.visit_id) continue;
      const seconds = Number(ev.meta.active_duration);
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      const key = JSON.stringify([ev.ref,ev.meta.visit_id]);
      pageTimes.set(key,Math.max(pageTimes.get(key)||0,seconds));
    }
    for (const [key,seconds] of pageTimes) {const [ref]=JSON.parse(key);const s=get(ref);s.activeStaySec=(s.activeStaySec||0)+seconds;}
    for (const s of Object.values(result)) {s.legacyMaxStaySec=s.maxStaySec;s.maxStaySec=s.activeStaySec===undefined?s.maxStaySec:s.activeStaySec;}
    for (const t of Object.values(targets)) {
      if (!t || !t.token) continue;
      const s=get(t.token);
      s.opened=s.opened||t.opened===true;s.visited=s.visited||t.visited===true;
      s.hot=s.kakaoClick=s.hot||!!t.hot;
      // Legacy snapshots have no event watermark. max avoids double-counting overlapping history.
      s.openCount=Math.max(s.openCount,Number(t.open_count)||0,t.opened===true?1:0);
      s.visitCount=Math.max(s.visitCount,Number(t.visit_count)||0,t.visited===true?1:0);
      s.maxScroll=Math.max(s.maxScroll,Number(t.max_scroll)||0);
      if(s.activeStaySec===undefined)s.maxStaySec=Math.max(s.maxStaySec,Number(t.max_stay_sec)||0);
      s.opened=s.opened||s.openCount>0; s.visited=s.visited||s.visitCount>0;
      const first=Date.parse(t.first_activity||'')||0;
      if(first) s.firstSeen=s.firstSeen?Math.min(s.firstSeen,first):first;
      s.lastSeen=Math.max(s.lastSeen,Date.parse(t.last_activity||'')||0);
    }
    return result;
  }
  function renderActivityCounts(stats = {}) {
    const count = value => Number.isFinite(Number(value)) ? Math.max(0,Math.floor(Number(value))) : 0;
    return `<div class="activity-counts" style="margin-top:5px;font-size:11.5px;color:#93c5fd;font-weight:600;display:flex;gap:8px;flex-wrap:wrap"><span>📨 메일 열람 ${count(stats.openCount)}회</span><span>·</span><span>🌐 페이지 조회 ${count(stats.visitCount)}회</span></div>`;
  }
  function activitySets(targets, events, sentOnly = false) {
    const result = {openedTokens:new Set(),visitedTokens:new Set(),hotTokens:new Set(),scroll90Tokens:new Set()};
    const stats=aggregateStats(targets,events);
    for(const t of Object.values(targets)) {
      if(!t || !t.token || (sentOnly && !['SENT','BOUNCED'].includes(t.status))) continue;
      const s=stats[t.token]; if(!s) continue;
      if(s.opened) result.openedTokens.add(t.token);
      if(s.visited) result.visitedTokens.add(t.token);
      if(s.hot) result.hotTokens.add(t.token);
      if(s.maxScroll>=90) result.scroll90Tokens.add(t.token);
    }
    return result;
  }
  window.Momentum = {visitEvents,trafficSummary,parseTimestamp,formatEventTime,unpersistedEvents,isTestEvent,renderActivityCounts,activitySets,aggregateStats,eventKey, normalizeEvent, mergeEvents, csvCell, setHTML, sendTelemetry};
  document.addEventListener('click', event => {
    const el = event.target.closest('[data-filter],[data-target-token],[data-notif-id]');
    if (!el) return;
    if (el.dataset.filter && window.setFilter) window.setFilter(el.dataset.filter, el);
    if (el.dataset.targetToken && window.filterTargetInTable) window.filterTargetInTable(el.dataset.targetToken);
    if (el.dataset.notifId && window.toggleSingleNotifRead) window.toggleSingleNotifRead(el.dataset.notifId);
  });
})();
