/* Shared data contracts; no network writes occur on import. */
(function () {
  'use strict';
  const allowed = /^(visit|view|email_open|open|scroll_50|scroll_90|duration_\d+s|leave|cta_click|kakao_click|roi_calc_change|pay_and_kakao_connect|payment_attempt|pay_modal_open)$/;
  function eventKey(ev) {
    return ev.event_id || ev.id || ev._msg_id || ev._id || [ev.time || ev.timestamp, ev.ref, ev.event].join('_');
  }
  function normalizeEvent(ev) {
    if (!ev || typeof ev !== 'object' || !allowed.test(ev.event || '') || typeof ev.ref !== 'string') return null;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(ev.ref) || ['__proto__','constructor','prototype'].includes(ev.ref)) return null;
    const value = Object.assign({}, ev);
    value.meta = ev.meta && typeof ev.meta === 'object' ? ev.meta : {};
    const raw = Number(ev.timestamp) || (typeof ev.time === 'number' ? ev.time : Date.parse(ev.time || '')) || Number(ev._received) || 0;
    value.timestamp = Number.isFinite(raw) && raw > 0 ? (raw < 1e11 ? raw * 1000 : raw) : 0;
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
  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function setHTML(el, markup) {
    if (!el) return;
    if (!window.DOMPurify) throw new Error('HTML sanitizer unavailable');
    el.innerHTML = window.DOMPurify.sanitize(String(markup), {USE_PROFILES: {html: true}});
  }
  function sendTelemetry(payload, topic, gasUrl) {
    payload.event_id = payload.event_id || (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(16).slice(2));
    payload.time = payload.time || new Date().toISOString();
    payload.timestamp = payload.timestamp || Date.now();
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
  function isTestEvent(ev) {
    return !!(ev.is_admin || ev.channel_type==='ADMIN_TEST' || (ev.meta && ev.meta.is_admin) || /^(vip|test|preview|admin|dev|sample|direct|o3eltr25|momentum|vip_test)$/i.test(ev.ref||'') || /^momentum-test-/i.test(ev.ref||''));
  }
  function aggregateStats(targets, events) {
    const result = Object.create(null);
    const get = ref => result[ref] || (result[ref]={opened:false,visited:false,hot:false,kakaoClick:false,openCount:0,visitCount:0,maxScroll:0,maxStaySec:0,firstSeen:0,lastSeen:0,events:[]});
    for (const ev of mergeEvents(events)) {
      if (isTestEvent(ev)) continue;
      const s=get(ev.ref), stamp=ev.timestamp;
      s.events.push(ev);
      if (stamp) {s.firstSeen=s.firstSeen?Math.min(s.firstSeen,stamp):stamp;s.lastSeen=Math.max(s.lastSeen,stamp);}
      if (ev.event==='email_open'||ev.event==='open') {s.opened=true;s.openCount++;}
      else {
        s.visited=true;
        if (ev.event==='visit'||ev.event==='view') s.visitCount++;
        if (ev.event==='kakao_click') s.hot=s.kakaoClick=true;
        if (ev.event==='scroll_90') s.maxScroll=Math.max(s.maxScroll,90);
        if (ev.event==='scroll_50') s.maxScroll=Math.max(s.maxScroll,50);
        s.maxStaySec=Math.max(s.maxStaySec,Number(ev.meta.duration)||0,Number(ev.meta.totalDuration)||0,Number(ev.meta.elapsed)||0);
      }
    }
    for (const t of Object.values(targets)) {
      if (!t || !t.token) continue;
      const s=get(t.token);
      s.opened=s.opened||t.opened===true;s.visited=s.visited||t.visited===true;
      s.hot=s.kakaoClick=s.hot||!!t.hot;
      // Legacy snapshots have no event watermark. max avoids double-counting overlapping history.
      s.openCount=Math.max(s.openCount,Number(t.open_count)||0,t.opened===true?1:0);
      s.visitCount=Math.max(s.visitCount,Number(t.visit_count)||0,t.visited===true?1:0);
      s.maxScroll=Math.max(s.maxScroll,Number(t.max_scroll)||0);
      s.maxStaySec=Math.max(s.maxStaySec,Number(t.max_stay_sec)||0);
      s.opened=s.opened||s.openCount>0; s.visited=s.visited||s.visitCount>0;
      const first=Date.parse(t.first_activity||'')||0;
      if(first) s.firstSeen=s.firstSeen?Math.min(s.firstSeen,first):first;
      s.lastSeen=Math.max(s.lastSeen,Date.parse(t.last_activity||'')||0);
    }
    return result;
  }
  function renderActivityCounts(stats = {}) {
    const count = value => Number.isFinite(Number(value)) ? Math.max(0,Math.floor(Number(value))) : 0;
    return `<div class="activity-counts" style="margin-top:5px;font-size:11.5px;color:#93c5fd;font-weight:600;display:flex;gap:8px;flex-wrap:wrap"><span>📨 메일 열람 ${count(stats.openCount)}회</span><span>·</span><span>🌐 사이트 방문 ${count(stats.visitCount)}회</span></div>`;
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
  window.Momentum = {isTestEvent,renderActivityCounts,activitySets,aggregateStats,eventKey, normalizeEvent, mergeEvents, csvCell, setHTML, sendTelemetry};
  document.addEventListener('click', event => {
    const el = event.target.closest('[data-filter],[data-target-token],[data-notif-id]');
    if (!el) return;
    if (el.dataset.filter && window.setFilter) window.setFilter(el.dataset.filter, el);
    if (el.dataset.targetToken && window.filterTargetInTable) window.filterTargetInTable(el.dataset.targetToken);
    if (el.dataset.notifId && window.toggleSingleNotifRead) window.toggleSingleNotifRead(el.dataset.notifId);
  });
})();
