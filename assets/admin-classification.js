/* Manual classification only. Tokens remain in memory; storage contains run metadata only. */
window.MomentumClassification = (() => {
  const root = 'https://api.github.com/repos/studiomomentum/momentum-cold-mailer';
  const workflow = root + '/actions/workflows/auto_prospect.yml';
  const runPage = 'https://github.com/studiomomentum/momentum-cold-mailer/actions';
  const key = 'sm_manual_classification_v1';
  const terminal = new Set(['success', 'failed']);
  let busy = false, timer = null, credential = '', state = readState();
  function readState() {
    try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' ? value : null; }
    catch (_) { return null; }
  }
  function render() {
    const button = document.getElementById('classifyButton');
    button.disabled = busy;
    button.textContent = busy ? (state?.phase === 'running' ? '분류 실행 중' : '처리 중') : state && !terminal.has(state.phase) ? '실행 상태 확인' : '분류·장전 실행';
    document.getElementById('classifyStatus').textContent = state?.message || '기존 후보 분류 · 메일 발송 없음';
    document.getElementById('kpiCard_READY').dataset.state = state?.phase || 'idle';
    const link = document.getElementById('classifyRunLink');
    link.hidden = !state;
    link.href = Number.isSafeInteger(state?.runId) ? runPage + '/runs/' + state.runId : runPage + '/workflows/auto_prospect.yml';
  }
  function save(phase, message, extra = {}) {
    state = Object.assign({}, state || {}, extra, {phase, message});
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) {}
    render();
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {...options, cache: 'no-store', signal: AbortSignal.timeout(20000), headers: {
      Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + credential,
      'X-GitHub-Api-Version': '2022-11-28', ...options.headers
    }});
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? '인증 또는 Actions 권한 확인 필요' : 'GitHub 응답 오류 (' + response.status + ')');
      error.httpStatus = response.status; throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  function stop() { clearTimeout(timer); timer = null; busy = false; credential = ''; render(); }
  async function refreshTargets() {
    await loadTargets(); updateKPIs(); renderTable();
  }
  async function poll() {
    try {
      if (!state.runId) {
        const list = await api(workflow + '/runs?event=workflow_dispatch&branch=main&per_page=30');
        const matches = (list.workflow_runs || []).filter(run => !state.baseline.includes(run.id) && run.actor?.login === state.actor && Date.parse(run.created_at) >= state.requestedAt - 5000);
        if (matches.length === 1) save('accepted', '접수 확인 · 실행 대기 중', {runId: matches[0].id});
        else if (matches.length > 1) {save('unknown', '접수 확인 필요 · 여러 실행이 있어 실행 상세에서 확인하세요.');stop();return;}
      }
      if (state.runId) {
        const run = await api(root + '/actions/runs/' + state.runId);
        if (run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || !/^\.github\/workflows\/auto_prospect\.yml(?:@|$)/.test(run.path || '')) throw new Error('분류 전용 실행 정보 불일치');
        if (run.status === 'completed') {
          if (run.conclusion === 'success') {
            save('success', '실행 완료 · 등록 결과는 실행 상세에서 확인');
            await refreshTargets();
          } else save('failed', '실행 실패 · ' + ({cancelled:'취소됨',timed_out:'시간 초과',failure:'오류 발생',skipped:'실행 건너뜀'}[run.conclusion] || run.conclusion || '결과 확인 필요'));
          stop(); return;
        }
        save(run.status === 'in_progress' ? 'running' : 'accepted', run.status === 'in_progress' ? '실행 중 · 기존 후보 분류 및 READY 등록' : '접수됨 · 실행 대기 중');
      }
      if (Date.now() - state.watchStartedAt > 30 * 60 * 1000) {save('unknown', '확인 지연 · 상태 확인으로 이어서 조회하세요.');stop();return;}
      timer = setTimeout(poll, 5000);
    } catch (error) {save('unknown', '실행 결과 확인 필요 · ' + (error.name === 'TimeoutError' ? '조회 시간 초과' : error.message));stop();}
  }
  async function begin() {
    state = readState();
    const token = requestGitHubCredential('Actions 읽기·쓰기');
    if (!token) {busy = false;render();return;}
    credential = token.trim();
    if (state && !terminal.has(state.phase)) {
      save(state.phase, '기존 실행 상태 확인 중', {watchStartedAt:Date.now()});
      await poll();return;
    }
    state = null;
    let attempted = false;
    try {
      const list = await api(workflow + '/runs?event=workflow_dispatch&branch=main&per_page=30');
      const active = (list.workflow_runs || []).find(run => run.status !== 'completed');
      if (active) {
        state = null;
        save('accepted','이미 접수된 분류 실행 확인 중',{runId:active.id,watchStartedAt:Date.now()});
        await poll();return;
      }
      const userResponse = await api('https://api.github.com/user');
      state = null;
      save('submitting','접수 요청 중',{baseline:(list.workflow_runs||[]).map(run=>run.id),actor:userResponse.login,requestedAt:Date.now(),watchStartedAt:Date.now()});
      attempted = true;
      const receipt = await api(workflow + '/dispatches', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{force:true},return_run_details:true})});
      save('accepted','접수됨 · 실행 대기 중', Number.isSafeInteger(receipt?.workflow_run_id) ? {runId:receipt.workflow_run_id} : {});
      await poll();
    } catch (error) {
      // A lost POST response is not proof of failure. Never automatically retry a dispatch.
      const ambiguous = attempted && (!error.httpStatus || error.httpStatus >= 500);
      save(ambiguous?'unknown':'failed', ambiguous?'접수 결과 확인 필요 · 재실행 없이 상태를 확인하세요.':'접수 실패 · '+error.message);
      stop();
    }
  }
  async function start() {
    if (busy) return;
    busy = true;render();
    if (navigator.locks) {
      await navigator.locks.request(key, {ifAvailable:true}, async lock => {
        if (!lock) {busy=false;state=readState();render();return;}
        await begin();
      });
    } else await begin();
  }
  window.addEventListener('storage', event => {if(event.key===key&&!busy){state=readState();render();}});
  render();
  return {start};
})();
