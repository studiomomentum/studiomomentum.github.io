
    /* ===================================================
       1. 서버 세션 기반 관리자 인증
       서버 검증 세션으로 관리자 제어를 인증합니다. 공개 집계 데이터는 기존 계약을 유지합니다.
       =================================================== */
    // 관리자 브라우저 기기 등록 (이 브라우저에서 메인 웹사이트 접속 시 텔레메트리 자동 면제)
    try {
      localStorage.setItem('sm_admin_device', 'true');
      sessionStorage.setItem('sm_admin_device', 'true');
      document.cookie = "sm_admin_device=true; path=/; max-age=31536000; SameSite=Lax";
    } catch(e) {}

    const TRACK_TOPIC = "sm_events_2026_x89a";
    const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbyGHgW1OYt8Xv4fivHmM5CGcVmgUzJtGFCfGWlBtD0Aob_FIZlILsvWvFZx-8zpu_7EUQ/exec";
    const LOCAL_EVENTS_KEY = "sm_stored_telemetry_events";
    // 관리자 테스트/미등록 테스트 토큰 블랙리스트 (인바운드 및 통계 오염 방지)
    const TEST_REFS = new Set(['vip', 'test', 'preview', 'admin', 'dev', 'o3eltr25', 'sample', 'direct']);

    let targetsMap = {};      // token -> target object
    let liveEvents = [];      // Array of event objects
    let mainTab = "SENT";     // 기본 탭: "SENT" (발송 완료 목록 - 최신순 정렬)
    let currentFilter = "ALL";

    const LOCAL_SYSTEM_CONFIG_KEY = "sm_admin_system_config";
    let systemConfig = {
      email_system_enabled: true,
      client_access_blocked: false,
      blocked_message: "현재 서비스 품질 향상을 위한 시스템 업데이트 점검 중입니다.\n잠시 후 다시 접속해 주시기 바랍니다."
    };

    async function loadSystemConfig() {
      try { systemConfig=await MomentumAdmin.call('settings.status'); updateSystemControlUI(); }
      catch (_) { document.getElementById('textEmailSystem').textContent='자동발송: 상태 확인 불가'; }
    }

    function updateSystemControlUI() {
      // 1. 이메일 자동발송 원터치 스위치 UI 갱신
      const btnEmail = document.getElementById("btnEmailSystemToggle");
      const iconEmail = document.getElementById("iconEmailSystem");
      const textEmail = document.getElementById("textEmailSystem");
      if (btnEmail && iconEmail && textEmail) {
        if (systemConfig.email_system_enabled !== false) {
          btnEmail.className = "system-ctrl-btn btn-sys-active";
          iconEmail.textContent = "⚡";
          textEmail.textContent = "자동발송: 가동중 (ON)";
        } else {
          btnEmail.className = "system-ctrl-btn btn-sys-paused";
          iconEmail.textContent = "⏸️";
          textEmail.textContent = "자동발송: 일시정지 (OFF)";
        }
      }

      // 2. 고객 페이지 접속 차단 스위치 UI 갱신
      const btnBlock = document.getElementById("btnClientBlockToggle");
      const iconBlock = document.getElementById("iconClientBlock");
      const textBlock = document.getElementById("textClientBlock");
      if (btnBlock && iconBlock && textBlock) {
        if (systemConfig.client_access_blocked === true) {
          btnBlock.className = "system-ctrl-btn btn-block-active";
          iconBlock.textContent = "🚧";
          textBlock.textContent = "고객접속: 차단중 (점검중)";
        } else {
          btnBlock.className = "system-ctrl-btn btn-block-normal";
          iconBlock.textContent = "🟢";
          textBlock.textContent = "고객접속: 정상 (OPEN)";
        }
      }
    }

    async function updateOperationalConfig(repo, changes) {
      const setting = Object.keys(changes)[0];
      await MomentumAdmin.call('settings.update', {setting, value: changes[setting]});
      Object.assign(systemConfig, changes); updateSystemControlUI();
      return true;
    }
    async function toggleEmailSystem() {
      const next = systemConfig.email_system_enabled !== true;
      if (!confirm('자동발송을 '+(next?'ON':'OFF')+'으로 저장할까요? 서치·분류는 계속 실행됩니다.')) return;
      try {
        if (await updateOperationalConfig('momentum-cold-mailer',{email_system_enabled:next}))
          alert('설정이 저장되었습니다. 발송기는 발송 전 설정을 다시 확인합니다.');
      } catch (err) { alert(err.message); }
    }
    async function toggleClientAccessBlock() {
      const next = systemConfig.client_access_blocked !== true;
      if (!confirm('홈페이지 점검 화면을 '+(next?'표시':'해제')+'하도록 저장할까요? 우분투 설정이 고객 화면에 반영됩니다.')) return;
      try {
        if (await updateOperationalConfig('studiomomentum.github.io',{client_access_blocked:next}))
          alert('설정이 저장되었습니다. 고객 화면에서 다음 설정 조회 시 적용됩니다.');
      } catch (err) { alert(err.message); }
    }

    async function checkBackupStatus() {
      try {
        const value=await ProjectControls.request('backup-status'); const res={ok:true,json:async()=>({status:value.error?'ERROR':'OK',last_error:value.error,last_backup_time:value.lastSuccessAt})};
        if (res.ok) {
          const statusObj = await res.json();
          const banner = document.getElementById("backupAlertBanner");
          if (!banner) return;

          if (statusObj && statusObj.status === "ERROR") {
            // 검증 이상 감지 -> 경고 배너 표출
            document.getElementById("backupAlertMsg").textContent = statusObj.last_error || "원인 불명의 백업 검증 실패가 발생했습니다.";
            document.getElementById("backupAlertTime").textContent = `최근 실패 시각: ${statusObj.last_failed_time || statusObj.last_backup_time || '알 수 없음'}`;
            banner.style.display = "block";
          } else {
            // 평소 정상 상태일 때는 완전히 숨김
            banner.style.display = "none";
          }
        }
      } catch (e) {
        // 파일이 아직 없거나 네트워크 오류 시 무시
      }
    }

    function dismissBackupAlert() {
      const banner = document.getElementById("backupAlertBanner");
      if (banner) banner.style.display = "none";
    }

    let dashboardStarted = false;
    let dashboardPoll = null;
    async function initDashboard() {
      if (dashboardStarted) return;
      dashboardStarted = true;
      
      document.getElementById("dashboardApp").style.display = "block";

      window.MomentumContent?.preload();

      // 1. 우분투 타깃 DB, 운영 설정 및 Drive 백업 상태 확인
      await Promise.all([loadTargets(), loadSystemConfig(), checkBackupStatus()]);

      // 2. pSEO 분석 보드 이전 사용자 접힘/펼침 상태 복원
      initPseoBoardState();

      // 3. 로컬스토리지에 누적 저장된 이전 이벤트 로드
      loadStoredEvents();

      // 4. ntfy.sh 원격 텔레메트리 동기화
      await fetchLiveTelemetry();

      // 5. 15초 주기 자동 새로고침 폴링 등록 (백업 상태도 함께 확인)
      dashboardPoll = setInterval(() => {
        if(!OpsAuth.hasAdminSession())return;
        loadTargets().then(() => fetchLiveTelemetry(false));
        loadSystemConfig();
        checkBackupStatus();
      }, 15000);
    }

    async function loadTargets() {
      try {
        const value=await ProjectControls.request('targets'); const res={ok:true,json:async()=>value};
        if (res.ok) {
          targetsMap = await res.json();
          applyPermanentExclusions();
          await refreshPermanentExclusions();
        }
      } catch (e) {
        console.warn("우분투 타깃 DB 조회 실패:", e);
      }
    }

    function loadStoredEvents() {
      try {
        const raw = localStorage.getItem(LOCAL_EVENTS_KEY);
        if (raw) {
          const list = JSON.parse(raw);
          // 저장된 이벤트 중 대표님 테스트 토큰 및 관리자 이벤트 자동 필터링
          liveEvents = Momentum.mergeEvents(Array.isArray(list) ? list : []).filter(ev => {
            const refLower = (ev.ref || '').toLowerCase();
            if (Momentum.isTestEvent(ev)) {
              return false;
            }
            return true;
          });
        }
      } catch (e) {}
    }

    function saveStoredEvents() {
      try {
        localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(liveEvents.slice(0, 1000)));
      } catch (e) {}
    }

    let telemetryBusy = false;
    async function fetchLiveTelemetry(manual = false) {
      if (telemetryBusy) return;
      telemetryBusy = true;
      const incoming = [];
      let successes = 0;
      let archivePending = false;
      try {
        const results = await Promise.allSettled([
          fetch(`https://ntfy.sh/${TRACK_TOPIC}/json?poll=1&since=all`).then(async res => {
            if (!res.ok) throw new Error('ntfy unavailable');
            const text = await res.text();
            return text.split('\n').filter(Boolean).flatMap(line => {
              try {
                const msg = JSON.parse(line);
                if (msg.event !== 'message') return [];
                const ev = JSON.parse(msg.message);
                return [Object.assign({},ev,{_msg_id:msg.id,_received:msg.time*1000})];
              } catch (_) { return []; }
            });
          }),
          fetch(GAS_DB_URL).then(async res => {
            if (!res.ok) throw new Error('GAS unavailable');
            const value = await res.json();
            if (!Array.isArray(value)) throw new Error('GAS returned an error');
            return value;
          })
        ]);
        for (const result of results) {
          if (result.status === 'fulfilled') { successes++; incoming.push(...result.value); }
        }
        liveEvents = Momentum.mergeEvents(liveEvents,incoming);
        // Preserve device-only history in the shared archive before calling sync complete.
        // A failed/uncertain POST leaves local history intact and is reconciled by the next GET.
        if (results[1].status === 'fulfilled') {
          const pending = Momentum.unpersistedEvents(liveEvents, results[1].value);
          try {
            for (let i = 0; i < pending.length; i += 100) {
              const res = await fetch(GAS_DB_URL, {method:'POST',
                headers:{'Content-Type':'text/plain;charset=UTF-8'},
                body:JSON.stringify(pending.slice(i,i+100))});
              const ack = await res.json();
              if (!res.ok || !ack || ack.status !== 'SUCCESS') throw new Error('Archive not acknowledged');
            }
          } catch (_) { archivePending = true; }
        } else { archivePending = true; }

        saveStoredEvents(); updateKPIs(); updatePseoBoard();  renderTable();
        document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString('ko-KR') +
          (archivePending?' 기기 기록 보존 중 · 서버 저장 재확인 필요':successes===2?' 동기화됨 · 서버 보존 확인':' 일부 소스 실패 · 보존 데이터 표시');
      } finally { telemetryBusy = false; }
    }

    /* ===================================================
       3. 메인 탭 전환 & KPI 계산 & 필터 바 동기화
       =================================================== */
    function handleKpiCardClick(type) {
      document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active-kpi'));
      const cardEl = document.getElementById(`kpiCard_${type}`);
      if (cardEl) cardEl.classList.add('active-kpi');

      if (type === 'SENT_ALL') {
        setMainTab('SENT', document.getElementById('tabBtnSent'));
        setFilter('ALL');
      } else if (type === 'OPENED_ALL') {
        setMainTab('SENT', document.getElementById('tabBtnSent'));
        setFilter('OPENED_ALL');
      } else if (type === 'VISITED') {
        setMainTab('SENT', document.getElementById('tabBtnSent'));
        setFilter('VISITED');
      } else if (type === 'HOT') {
        setMainTab('SENT', document.getElementById('tabBtnSent'));
        setFilter('HOT');
      } else if (type === 'SCROLL_90') {
        setMainTab('SENT', document.getElementById('tabBtnSent'));
        setFilter('SCROLL_90');
      } else if (type === 'INBOUND') {
        setMainTab('INBOUND', document.getElementById('tabBtnInbound'));
        setFilter('ALL');
      }

      // 테이블 영역으로 즉시 이동해 터치 스크롤을 바로 이어갈 수 있게 함
      const targetSection = document.querySelector('.table-controls') || document.getElementById('targetsTable');
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }

    function updateKPIs() {
      const searchStats = window.MomentumSearchProgress?.stats() || {};
      const targetsList = Object.values(targetsMap).filter(t => t && t.token && t.token !== '_search_db_stats');
      const totalSent = targetsList.filter(t => t.status === "SENT" || t.status === "BOUNCED").length;
      const totalReady = targetsList.filter(t => t.status === "READY").length;

      // 탭 뱃지 카운트 갱신
      const elSent = document.getElementById("tabSentCount");
      const elReady = document.getElementById("tabReadyCount");
      const elSearchDB = document.getElementById("tabSearchDBCount");
      const elInbound = document.getElementById("tabInboundCount");
      const elAll = document.getElementById("tabAllCount");
      if (elSent) elSent.textContent = totalSent;
      if (elReady) elReady.textContent = totalReady;
      if (elSearchDB) elSearchDB.textContent = (searchStats.total_candidates ?? 0) + "건";
      if (elAll) elAll.textContent = targetsList.length;

      const {openedTokens,visitedTokens,hotTokens,scroll90Tokens} = Momentum.activitySets(targetsMap,liveEvents,true);
      const inboundTokens = new Set(Momentum.mergeEvents(liveEvents).filter(ev =>
        !targetsMap[ev.ref] && !Momentum.isTestEvent(ev) && !['open','email_open'].includes(ev.event)
      ).map(ev=>ev.ref));

      if (elInbound) elInbound.textContent = inboundTokens.size;
      const elKpiInbound = document.getElementById("kpiInboundCount");
      if (elKpiInbound) elKpiInbound.textContent = inboundTokens.size;
      const elKpiInboundSub = document.getElementById("kpiInboundSub");
      if (elKpiInboundSub) elKpiInboundSub.textContent = `공개 정상가 상담 대상 (${inboundTokens.size}명)`;

      document.getElementById("kpiSentCount").textContent = totalSent;
      document.getElementById("kpiSentSub").textContent = `반송 포함 ${totalSent}건`;

      const openCount = openedTokens.size;
      const openRate = totalSent > 0 ? ((openCount / totalSent) * 100).toFixed(1) : 0;
      if (document.getElementById("kpiOpenedCount")) {
        document.getElementById("kpiOpenedCount").textContent = openCount + "곳";
        document.getElementById("kpiOpenedRate").textContent = `열람 기록률: ${openRate}% (${openCount}/${totalSent}) · 수신처 중복 제외`;
      }

      document.getElementById("kpiVisitedCount").textContent = visitedTokens.size;
      const rate = totalSent > 0 ? ((visitedTokens.size / totalSent) * 100).toFixed(1) : 0;
      document.getElementById("kpiVisitedRate").textContent = `방문 전환율: ${rate}% (${visitedTokens.size}/${totalSent})`;

      document.getElementById("kpiHotCount").textContent = hotTokens.size;
      document.getElementById("kpiReadyCount").textContent = totalReady;

      updatePseoBoard();
      updateFilterBar();
    }

    /* ===================================================
       pSEO & GEO 실시간 분석 보드 제어 로직
       =================================================== */
    const PSEO_REGIONS = ["동탄·화성", "판교·분당", "강남·서초", "수원·광교", "용인·수지", "평택·고덕", "송파·잠실", "안양·평촌", "여의도·영등포", "가산·구로", "일산·고양", "인천·송도"];
    const PSEO_INDUSTRIES = ["병원·의원·피부과", "법무법인·변호사", "세무회계·세무사", "부동산·분양·중개", "프리미엄 입시학원"];

    const PSEO_BOARD_STATE_KEY = "sm_pseo_board_collapsed";

    function initPseoBoardState() {
      const content = document.getElementById("pseoBoardContent");
      const icon = document.getElementById("pseoToggleIcon");
      if (!content) return;
      const isCollapsed = localStorage.getItem(PSEO_BOARD_STATE_KEY) === "true";
      if (isCollapsed) {
        content.style.display = "none";
        if (icon) icon.textContent = "▶ 펼치기";
      } else {
        content.style.display = "grid";
        if (icon) icon.textContent = "▼ 접기/펼치기";
      }
    }

    function togglePseoBoard() {
      const content = document.getElementById("pseoBoardContent");
      const icon = document.getElementById("pseoToggleIcon");
      if (!content) return;
      if (content.style.display === "none") {
        content.style.display = "grid";
        if (icon) icon.textContent = "▼ 접기/펼치기";
        localStorage.setItem(PSEO_BOARD_STATE_KEY, "false");
      } else {
        content.style.display = "none";
        if (icon) icon.textContent = "▶ 펼치기";
        localStorage.setItem(PSEO_BOARD_STATE_KEY, "true");
      }
    }

    function filterByPseoRegion(reg) {
      setMainTab('INBOUND', document.getElementById('tabBtnInbound'));
      const searchInput = document.getElementById("searchInput");
      if (searchInput) {
        searchInput.value = reg.split('·')[0];
        renderTable();
      }
    }

    function filterByPseoIndustry(ind) {
      setMainTab('INBOUND', document.getElementById('tabBtnInbound'));
      const searchInput = document.getElementById("searchInput");
      if (searchInput) {
        searchInput.value = ind.split('·')[0];
        renderTable();
      }
    }

    function updatePseoBoard() {
      const regionCounts = {};
      const indCounts = {};
      PSEO_REGIONS.forEach(r => regionCounts[r] = 0);
      PSEO_INDUSTRIES.forEach(i => indCounts[i] = 0);

      let totalPseo = 0;
      let totalGeo = 0;
      let totalAeo = 0;
      let roiCalculations = 0;
      let roiSalarySum = 0;
      let roiSalarySamples = 0;
      const aiSources = { 'ChatGPT': 0, 'Perplexity (AEO)': 0, 'Claude': 0, 'Gemini': 0, 'Google AI (AEO)': 0, 'Others': 0 };

      const canonicalViews = new Set(Momentum.visitEvents(liveEvents).map(Momentum.eventKey));
      Momentum.mergeEvents(liveEvents).forEach(ev => {
        const refLower = (ev.ref || '').toLowerCase();
        if (Momentum.isTestEvent(ev)) return;

        const isPageView = canonicalViews.has(Momentum.eventKey(ev));
        const kind = ev.meta.entry_channel_type || ev.channel_type || (ev.ref?.startsWith('pseo_') ? 'PSEO' : '');

        // 1. PSEO 감지
        if (isPageView && kind === 'PSEO') {
          totalPseo++;
          const r = ev.region || ev.meta.entry_region || (ev.channel_name ? ev.channel_name.split(' ')[0] : '');
          const ind = ev.industry || ev.meta.entry_industry || (ev.channel_name ? ev.channel_name.split(' ')[1] : '');

          PSEO_REGIONS.forEach(reg => {
            if (r && (reg.includes(r) || r.includes(reg.split('·')[0]))) regionCounts[reg] = (regionCounts[reg] || 0) + 1;
          });
          PSEO_INDUSTRIES.forEach(industry => {
            if (ind && (industry.includes(ind) || ind.includes(industry.split('·')[0]))) indCounts[industry] = (indCounts[industry] || 0) + 1;
          });
        }

        // 2. AEO (답변 엔진 직답 인용) 감지
        if (isPageView && kind === 'AEO') {
          totalAeo++;
          const name = (ev.meta.entry_channel_name || ev.channel_name || '').toLowerCase();
          if (name.includes('perplexity')) aiSources['Perplexity (AEO)']++;
          else if (name.includes('overview') || name.includes('google')) aiSources['Google AI (AEO)']++;
          else aiSources['Others']++;
        }
        // 3. GEO (생성형 AI 추천) 감지
        else if (isPageView && kind === 'GEO') {
          totalGeo++;
          const name = (ev.meta.entry_channel_name || ev.channel_name || '').toLowerCase();
          if (name.includes('chatgpt') || name.includes('openai')) aiSources['ChatGPT']++;
          else if (name.includes('claude')) aiSources['Claude']++;
          else if (name.includes('gemini')) aiSources['Gemini']++;
          else aiSources['Others']++;
        }

        // 4. ROI 계산기 조작 감지
        if (ev.event === 'roi_calc_change') {
          roiCalculations++;
          const salary=Number(ev.meta?.salary);
          if (Number.isFinite(salary) && salary>0) {roiSalarySamples++;roiSalarySum+=salary;}
        }
      });

      const metrics = Momentum.trafficSummary(liveEvents.filter(ev => ev.channel_type !== 'OUTBOUND' || (ev.meta?.entry_channel_type && ev.meta.entry_channel_type !== 'OUTBOUND')));
      const metricLabel = document.getElementById('trafficMetricSummary');
      if (metricLabel) metricLabel.textContent = `페이지 조회 ${metrics.pageViews}회 · 새 기준 방문 세션 ${metrics.sessions}개 · 브라우저 방문자 ${metrics.browserVisitors}개 · 세션 구분 불가한 과거 조회 ${metrics.legacyPageViews}회`;
      const totalBadgeEl = document.getElementById("pseoTotalBadge");
      if (totalBadgeEl) totalBadgeEl.textContent = `페이지 조회 · pSEO ${totalPseo}회 | AI 추천 ${totalGeo}회 | AI 검색 ${totalAeo}회`;

      // 렌더링: 권역별 랭킹
      const regEl = document.getElementById("pseoRegionList");
      if (regEl) {
        const sortedRegs = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
        const maxVal = Math.max(1, sortedRegs[0][1]);
        Momentum.setHTML(regEl, sortedRegs.map(([reg, count], idx) => {
          const pct = Math.round((count / maxVal) * 100);
          const isTop = idx < 3 && count > 0;
          return `
            <div class="pseo-item" data-pseo-region="${reg}" role="button" tabindex="0" title="클릭 시 '${reg}' 유입 필터링">
              <div class="pseo-item-header">
                <span class="pseo-item-name">${idx + 1}. ${reg} ${isTop ? '🔥' : ''}</span>
                <span class="pseo-item-val">${count}건</span>
              </div>
              <div class="pseo-bar-track">
                <div class="pseo-bar-fill" style="width: ${Math.max(5, pct)}%; background: ${idx === 0 ? '#38bdf8' : (idx === 1 ? '#60a5fa' : '#818cf8')};"></div>
              </div>
            </div>
          `;
        }).join(""));
      }

      // 렌더링: 업종별 분포
      const indEl = document.getElementById("pseoIndustryList");
      if (indEl) {
        const sortedInds = Object.entries(indCounts).sort((a, b) => b[1] - a[1]);
        const maxVal = Math.max(1, sortedInds[0][1]);
        Momentum.setHTML(indEl, sortedInds.map(([ind, count], idx) => {
          const pct = Math.round((count / maxVal) * 100);
          return `
            <div class="pseo-item" data-pseo-industry="${ind}" role="button" tabindex="0" title="클릭 시 '${ind}' 유입 필터링">
              <div class="pseo-item-header">
                <span class="pseo-item-name">${ind}</span>
                <span class="pseo-item-val" style="color: #34d399;">${count}건</span>
              </div>
              <div class="pseo-bar-track">
                <div class="pseo-bar-fill" style="width: ${Math.max(5, pct)}%; background: #10b981;"></div>
              </div>
            </div>
          `;
        }).join(""));
      }

      // 렌더링: AI 유입 & ROI 계산기 통계
      const geoEl = document.getElementById("pseoGeoStats");
      if (geoEl) {
        const avgSalary = roiSalarySamples > 0 ? Math.round(roiSalarySum / roiSalarySamples)+'만 원' : '기록 없음';
        Momentum.setHTML(geoEl, `
          <div style="background: rgba(15,23,42,0.6); padding: 12px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 10px;">
            <div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 6px;">🤖 AI 검색 추천 &amp; 직답 인용 (관측된 AI 링크·캠페인)</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <span class="badge" style="background:#0284c7; color:white; font-size:11px;">ChatGPT: ${aiSources['ChatGPT']}</span>
              <span class="badge" style="background:#8b5cf6; color:white; font-size:11px;">Perplexity: ${aiSources['Perplexity (AEO)']}</span>
              <span class="badge" style="background:#059669; color:white; font-size:11px;">Google AI 링크: ${aiSources['Google AI (AEO)']}</span>
              <span class="badge" style="background:#d97706; color:white; font-size:11px;">Claude: ${aiSources['Claude']}</span>
              <span class="badge" style="background:#475569; color:white; font-size:11px;">Gemini: ${aiSources['Gemini']}</span>
              <span class="badge" style="background:#475569; color:white; font-size:11px;">기타 AI: ${aiSources['Others']}</span>
            </div>
          </div>
          <div style="background: rgba(15,23,42,0.6); padding: 12px; border-radius: 8px; border: 1px solid #334155;">
            <div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 4px;">📊 ROI 계산기 실시간 시뮬레이션</div>
            <div style="font-size: 12.5px; color: #f8fafc; line-height: 1.6;">
              • 계산기 시뮬레이션: <strong style="color:#38bdf8;">${roiCalculations}회</strong><br>
              • 계산기 월급 입력값 평균: <strong style="color:#fbbf24;">${avgSalary}</strong><br>
              • 계산기 입력값 기준이며 실제 계약·절감 성과가 아닙니다.
            </div>
          </div>
        `);
      }
    }

    function isJobPostingTarget(target) {
      if (!target) return false;
      if (target.is_priority) return true;
      const combined = ((target.point || '') + ' ' + (target.views || '')).toLowerCase();
      return combined.includes('구인') || combined.includes('채용') || combined.includes('공고');
    }

    function getInboundList() {
      const inboundsMap = {};
      liveEvents.forEach(ev => {
        const refLower = (ev.ref || '').toLowerCase();
        if (Momentum.isTestEvent(ev)) return;

        const isTarget = ev.ref && targetsMap[ev.ref];
        const isPseo = ev.channel_type === 'PSEO' || (ev.ref && ev.ref.startsWith('pseo_'));
        const isInbound = isPseo || (ev.ref && ev.ref.startsWith('inbound_')) || ev.channel_type === 'GEO' || ev.channel_type === 'AEO' || ev.channel_type === 'SEO' || ev.channel_type === 'SNS' || (!isTarget && ev.ref && !TEST_REFS.has(refLower));
        if (!isInbound) return;

        const key = ev.ref || 'inbound_unknown';
        if (!inboundsMap[key]) {
          let chType = isPseo ? 'PSEO' : (ev.channel_type || 'DIRECT');
          let chName = ev.meta?.entry_channel_name || ev.channel_name || '';
          if (!chName) {
            if (isPseo) {
              chName = `${ev.region || ''} ${ev.industry || ''} (pSEO)`;
            } else {
              const r = (ev.ref_url || '').toLowerCase();
              if (r.includes('chatgpt') || r.includes('openai')) { chType = 'GEO'; chName = 'ChatGPT (AI 추천)'; }
              else if (r.includes('perplexity')) { chType = 'GEO'; chName = 'Perplexity AI (AI 검색)'; }
              else if (r.includes('claude')) { chType = 'GEO'; chName = 'Claude AI (AI 추천)'; }
              else if (r.includes('gemini')) { chType = 'GEO'; chName = 'Google Gemini (AI 추천)'; }
              else if (r.includes('naver')) { chType = 'SEO'; chName = '네이버 검색 (Naver SEO)'; }
              else if (r.includes('google')) { chType = 'SEO'; chName = '구글 검색 (Google SEO)'; }
              else if (r.includes('daum') || r.includes('kakao')) { chType = 'SEO'; chName = '다음/카카오 검색'; }
              else { chType = 'DIRECT'; chName = '자연 유입 / 직접 접속'; }
            }
          }

          inboundsMap[key] = {
            token: key,
            channel_type: chType,
            channel_name: chName,
            pricing: '💎 공개 정상가 상담',
            hot: false,
            firstSeen: ev.timestamp || 0,
            lastSeen: ev.timestamp || 0,
            maxScroll: 0,
            maxStaySec: 0,
            device: ev.device || 'Desktop',
            screen: ev.screen || '',
            ref_url: ev.ref_url || 'Direct'
          };
        }

        const s = inboundsMap[key];
        if (ev.timestamp) s.firstSeen = s.firstSeen ? Math.min(s.firstSeen, ev.timestamp) : ev.timestamp;
        s.lastSeen = Math.max(s.lastSeen, ev.timestamp || 0);
        if (['kakao_click','pay_and_kakao_connect'].includes(ev.event)) s.hot = true;
        if (ev.event === 'scroll_90') s.maxScroll = Math.max(s.maxScroll, 90);
        if (ev.event === 'scroll_50') s.maxScroll = Math.max(s.maxScroll, 50);
        if (ev.meta && ev.meta.duration) s.maxStaySec = Math.max(s.maxStaySec, ev.meta.duration);
        if (ev.meta && ev.meta.totalDuration) s.maxStaySec = Math.max(s.maxStaySec, ev.meta.totalDuration);
        if (ev.meta && ev.meta.elapsed) s.maxStaySec = Math.max(s.maxStaySec, Number(ev.meta.elapsed) || 0);
      });
      const measured = Momentum.aggregateStats({}, liveEvents);
      for (const row of Object.values(inboundsMap)) if (measured[row.token]?.activeStaySec !== undefined) row.maxStaySec = measured[row.token].activeStaySec;
      return Object.values(inboundsMap);
    }

    function formatRelativeTime(ts) {
      ts = Momentum.parseTimestamp(ts);
      if (!ts) return '시각 미기록';
      const diff = Math.floor((Date.now() - ts) / 1000);
      if (diff < 60) return "방금 전";
      if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
      return `${Math.floor(diff / 86400)}일 전`;
    }

    function exportDataCSV() {
      // 1. 이벤트 종합 집계
      const statsMap = Momentum.aggregateStats(targetsMap, liveEvents);

      // 2. 타깃별 추적 마스터 시트 생성
      const list = Object.values(targetsMap).filter(t => t && t.token && t.token !== '_search_db_stats');
      let csvContent = "\uFEFF[타깃 활동 추적 마스터]\n";
      csvContent += "순번,토큰,회사채널명,대표자,이메일,지역,카테고리,발송상태,발송일시,열람상태,방문상태,열람횟수,방문횟수,카톡상담클릭,완독률(%),체류시간(초),최초활동일시,최근활동일시\n";

      list.forEach(t => {
        const s = statsMap[t.token];
        const isOpened = s && s.opened;
        const isVisited = s && s.visited;
        const openStatus = isOpened ? "열람완료" : "미열람";
        const visitStatus = isVisited ? "사이트방문" : "미방문";
        const openCnt = s ? s.openCount : 0;
        const visitCnt = s ? s.visitCount : 0;
        const hotStr = s && s.kakaoClick ? "Y" : "N";
        const scrollPct = s ? s.maxScroll : 0;
        const staySec = s ? s.maxStaySec : 0;
        const firstStr = s && s.firstSeen ? Momentum.formatEventTime(s.firstSeen) : "-";
        const lastStr = s && s.lastSeen ? Momentum.formatEventTime(s.lastSeen) : "-";

        csvContent += [t.no,t.token,t.company,t.rep,t.email,t.region,t.category,t.status,t.sent_at,openStatus,visitStatus,openCnt,visitCnt,hotStr,scrollPct,staySec,firstStr,lastStr].map(Momentum.csvCell).join(',')+'\n';
      });

      // 3. 브라우저 캐시 원본 이벤트 로그 블록 (현재 브라우저 보유분; 전체 서버 백업 아님)
      csvContent += "\n\n[원본 이벤트 텔레메트리 로그]\n";
      csvContent += "이벤트ID,일시,토큰,이벤트유형,채널,기기,해상도,체류/완독,메타데이터\n";
      liveEvents.forEach(ev => {
        const timeStr = Momentum.formatEventTime(ev.timestamp);
        const metaStr = ev.meta ? JSON.stringify(ev.meta).replace(/"/g, '""') : "";
        csvContent += [ev._id,timeStr,ev.ref,ev.event,ev.channel_type,ev.device,ev.screen,ev.meta && ev.meta.duration,JSON.stringify(ev.meta||{})].map(Momentum.csvCell).join(',')+'\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `솟 모멘텀_타깃_방문추적_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
    }

    // 페이지 진입 시 인증 상태 확인

  