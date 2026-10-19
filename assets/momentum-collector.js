/* Telemetry v2: page views, tab sessions and browser visitors are distinct identities.
   Queue entries are removed only after Drive GET readback confirms event_id. */
(function () {
  'use strict';
  const PREFIX = 'sm_telemetry_pending_v2:', SESSION = 'sm_telemetry_session_v2';
  const memory = new Map();
  let session, pageId, flushTask, timer, started = false;
  const uuid = () => window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const store = kind => { try { return window[kind]; } catch (_) { return null; } };
  const read = (kind, key) => { try { return store(kind)?.getItem(key); } catch (_) { return null; } };
  const write = (kind, key, value) => { try { const s=store(kind); if (!s) return false; s.setItem(key,value); return true; } catch (_) { return false; } };
  function status() {
    return {pending: entries().length, persistent: !!store('localStorage') && !storageError, storageError: storageError};
  }
  let storageError = false;
  function save(entry) {
    memory.set(entry.payload.event_id, entry);
    if (!write('localStorage', PREFIX + entry.payload.event_id, JSON.stringify(entry))) storageError = true;
  }
  function remove(id) {
    memory.delete(id);
    try { store('localStorage')?.removeItem(PREFIX + id); } catch (_) {}
  }
  function entries() {
    const found = new Map(memory);
    try {
      const storage = store('localStorage');
      for (let i=0; storage && i<storage.length; i++) {
        const key=storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try { const e=JSON.parse(storage.getItem(key)); if(e?.payload?.event_id) found.set(e.payload.event_id,e); } catch (_) {}
      }
    } catch (_) {}
    return [...found.values()];
  }
  function observedChannel(payload, arrival) {
    if (['OUTBOUND','PSEO'].includes(payload.channel_type)) return;
    const host=String(arrival.arrival_host||'').toLowerCase();
    const source=String(arrival.utm_source||'').toLowerCase(),medium=String(arrival.utm_medium||'').toLowerCase();
    let type='DIRECT',name='직접 / 출처 미확인';
    if (source || medium) {
      type='CAMPAIGN';name='캠페인: '+(source||medium);
      if (['organic','organic_search','seo','search'].includes(medium) && ['google','naver','bing','daum'].includes(source)) {type='SEO';name='검색 캠페인: '+source;}
      if (medium==='organic_social') {type='SNS';name='소셜 캠페인: '+(source||'출처 미확인');}
    } else if (/(^|\.)(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/.test(host)) {type='GEO';name='AI 추천 링크: '+host;}
    else if (/(^|\.)perplexity\.ai$/.test(host)) {type='AEO';name='AI 검색 링크: '+host;}
    else if (/^(?:(?:www|m|search)\.)?google\.(?:com|co\.kr|co\.jp|co\.uk|de|fr|ca|com\.au|co\.in|com\.br)$/.test(host)) {type='SEO';name='구글 검색';}
    else if (/^(?:(?:www|m|search|m\.search)\.)?naver\.com$/.test(host)) {type='SEO';name='네이버 검색';}
    else if (/(^|\.)(bing\.com|search\.daum\.net)$/.test(host)) {type='SEO';name='기타 검색: '+host;}
    else if (host) {type='REFERRAL';name=host===window.location.hostname?'사이트 내부 이동':'외부 링크: '+host;}
    payload.channel_type=type;payload.channel_name=name;window._smChannelType=type;
  }
  function context(payload, arrival) {
    observedChannel(payload, arrival);
    const now=Date.now();
    if (!session) { try { session=JSON.parse(read('sessionStorage',SESSION)); } catch (_) {} }
    const outgoing=payload.channel_type==='OUTBOUND';
    if (!session || now-session.lastAt>30*60000 || (outgoing && session.outgoing && session.ref!==payload.ref)) {
      pageId=undefined;
      let visitor=read('localStorage','sm_telemetry_visitor_v2');
      if(!visitor) { visitor=uuid(); write('localStorage','sm_telemetry_visitor_v2',visitor); }
      session={id:uuid(),visitor,ref:payload.ref,outgoing,lastAt:now,entry:{...arrival,path:window.location.pathname||'/',channel_type:payload.channel_type,channel_name:payload.channel_name||'',region:payload.region||'',industry:payload.industry||''}};
    }
    session.lastAt=now;write('sessionStorage',SESSION,JSON.stringify(session));
    pageId=pageId||uuid();
    // Preserve CRM refs for outreach; anonymous ref remains that of the session entry page.
    if(!outgoing) {if(!session.outgoing)payload.ref=session.ref;window._smConsultRef=payload.ref;payload.pricing_tier=payload.pricing_tier||'INBOUND_PUBLIC';}
    return {schema_version:2,visitor_id:session.visitor,session_id:session.id,visit_id:pageId,
      entry_ref:session.ref,entry_path:session.entry.path,entry_channel_type:session.entry.channel_type,
      entry_channel_name:session.entry.channel_name,entry_region:session.entry.region,entry_industry:session.entry.industry,
      entry_source:session.entry.arrival_source,entry_host:session.entry.arrival_host,
      entry_utm_source:session.entry.utm_source,entry_utm_medium:session.entry.utm_medium,
      entry_utm_campaign:session.entry.utm_campaign,entry_utm_content:session.entry.utm_content};
  }
  function schedule(ms=1000) {
    if (!window.setTimeout || timer) return;
    timer=window.setTimeout(()=>{timer=null; flush();},ms);
  }
  async function request(url, options) {
    const controller=window.AbortController?new window.AbortController():null;
    const timeout=controller&&window.setTimeout(()=>controller.abort(),15000);
    try { return await window.fetch(url,{...options,...(controller?{signal:controller.signal}: {})}); }
    finally {if(timeout)window.clearTimeout(timeout);}
  }
  function start() {
    if(started)return;started=true;
    window.addEventListener?.('online',()=>flush(true));
    window.addEventListener?.('pageshow',()=>flush(true));
    window.addEventListener?.('pagehide',()=>{
      // A beacon is an attempt, never a storage acknowledgement. Keep every queued entry.
      for(const e of entries().slice(0,20)) {
        const body=JSON.stringify(e.payload);
        try { if(e.gas)navigator.sendBeacon?.(e.gas,body); } catch (_) {}
      }
    });
    if(entries().length)schedule();
  }
  function deliver(payload, topic, gas) {
    start();
    const entry={payload:JSON.parse(JSON.stringify(payload)),ntfy:'https://ntfy.sh/'+topic,gas:gas||'',ntfyAck:false,attempts:0,nextAt:0};
    save(entry);
    if(document.visibilityState==='hidden' || payload.meta?.reason==='pagehide') {
      for(const url of [entry.ntfy,entry.gas].filter(Boolean)) {try {navigator.sendBeacon?.(url,JSON.stringify(entry.payload));}catch(_) {}}
    }
    schedule(0);
    return Promise.resolve({queued:true,persistent:!storageError,event_id:payload.event_id});
  }
  function flush(force=false) {
    if(flushTask)return flushTask;
    flushTask=(async()=>{
      const batch=entries().filter(e=>force || e.nextAt<=Date.now()).slice(0,20);
      for(const e of batch) {
        if(!e.ntfyAck) {
          try {const r=await request(e.ntfy,{method:'POST',body:JSON.stringify(e.payload),headers:{'Content-Type':'text/plain;charset=UTF-8'},keepalive:true,mode:'cors'});e.ntfyAck=r.ok===true;} catch (_) {}
        }
      }
      const gasGroups=new Map();
      for(const e of batch) {
        if(e.gas){if(!gasGroups.has(e.gas))gasGroups.set(e.gas,[]);gasGroups.get(e.gas).push(e);}
        else if(e.ntfyAck)remove(e.payload.event_id);
      }
      const confirmed=new Set();
      for(const [url,group] of gasGroups) {
        try {
          await request(url,{method:'POST',body:JSON.stringify(group.map(e=>e.payload)),headers:{'Content-Type':'text/plain;charset=UTF-8'},keepalive:true,mode:'no-cors'});
          const r=await request(url,{method:'GET',cache:'no-store',mode:'cors'});
          if(!r.ok)throw Error('Archive readback failed');
          const saved=await r.json();if(!Array.isArray(saved))throw Error('Archive did not return records');
          const ids=new Set(saved.map(e=>e.event_id).filter(Boolean));
          for(const e of group)if(ids.has(e.payload.event_id))confirmed.add(e.payload.event_id);
        } catch (_) { /* Retain original IDs for idempotent retry on the next visit/online event. */ }
      }
      for(const e of batch) {
        if(confirmed.has(e.payload.event_id)){remove(e.payload.event_id);continue;}
        if(!e.gas&&e.ntfyAck)continue;
        e.attempts++;e.nextAt=Date.now()+Math.min(300000,5000*2**Math.min(e.attempts,6));save(e);
      }
    })().finally(()=>{flushTask=null;if(entries().length)schedule(10000);});
    return flushTask;
  }
  function activeTracker(send, milestones=[10,30,60,90]) {
    const isActive=()=>document.visibilityState!=='hidden' && (typeof document.hasFocus!=='function' || document.hasFocus());
    let accrued=0, since=isActive()?performance.now():null, sequence=0, finished=false,lastHeartbeat=0;
    const fired=new Set();
    const seconds=()=>Math.max(0,Math.floor((accrued+(since===null?0:Math.max(0,performance.now()-since)))/1000));
    const sample=()=>{const duration=seconds();for(const n of milestones)if(duration>=n&&!fired.has(n)){fired.add(n);send('duration_'+n+'s',{duration:n,active_duration:duration,measurement:'visible_time_v2'});}};
    const checkpoint=reason=>{sample();sequence++;send(reason==='heartbeat'?'engagement':'leave',{totalDuration:seconds(),active_duration:seconds(),checkpoint:sequence,reason,measurement:'visible_time_v2'});};
    const pause=reason=>{if(since!==null){accrued+=Math.max(0,performance.now()-since);since=null;}checkpoint(reason);};
    window.addEventListener('blur',()=>pause('blur'));
    window.addEventListener('focus',()=>{if(!finished&&isActive()&&since===null)since=performance.now();});
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='hidden')pause('hidden');
      else if(!finished&&isActive()&&since===null)since=performance.now();
    });
    window.addEventListener('pagehide',()=>{if(finished)return;if(since!==null){accrued+=Math.max(0,performance.now()-since);since=null;}checkpoint('pagehide');finished=true;});
    window.addEventListener('pageshow',e=>{if(e.persisted){finished=false;if(isActive())since=performance.now();}});
    const tick=()=>{if(finished)return;sample();if(isActive()&&seconds()-lastHeartbeat>=15){lastHeartbeat=seconds();checkpoint('heartbeat');}};
    const interval=window.setInterval(tick,1000);
    return {seconds,sample,stop:()=>{window.clearInterval(interval);finished=true;}};
  }
  window.MomentumCollector={context,deliver,flush,status,activeTracker};
  start();
})();
