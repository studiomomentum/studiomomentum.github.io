/* Public UI only; bearer access is visitor-specific. No admin/Codex credentials. */
(() => {
  'use strict';
  const endpoint='https://script.google.com/macros/s/AKfycbyGHgW1OYt8Xv4fivHmM5CGcVmgUzJtGFCfGWlBtD0Aob_FIZlILsvWvFZx-8zpu_7EUQ/exec';
  const kakao='https://open.kakao.com/o/sEX8RWNi',key='sm_consult_v1';
  const event=(name,meta={})=>window._smSendEvent?.(name,meta);
  let saved=null;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.expiresAt<Date.now())saved=null;}catch{}
  const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  let state=saved||{token:token(),id:null,messages:[],expiresAt:Date.now()+86400000};
  let dialog,els,lastFocus,timer,busy=false,pollBusy=false,pendingSend=null,entry='hero';
  function persist(){try{sessionStorage.setItem(key,JSON.stringify(state));}catch{}}
  async function api(action,extra={}){
    const r=await fetch(endpoint,{method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({route:'momentum_consult',action,token:state.token,id:state.id,...extra}),signal:AbortSignal.timeout(25000)});
    if(!r.ok)throw Error('NETWORK');const d=await r.json();if(!d.ok)throw Error(d.error||'NETWORK');return d.result;
  }
  const errors={CONSULT_OFFLINE:'지금은 AI 상담이 쉬고 있어요. PD와 직접 상담하실 수 있습니다',CONSULT_RATE_LIMIT:'AI 상담은 여기까지 도와드릴 수 있어요. 대화를 정리해서 PD와 이어가세요',CONSULT_UNAUTHORIZED:'대화 연결이 만료되었습니다. 새 대화를 시작하거나 PD에게 연결해 주세요',CONSULT_BUSY:'앞선 답변을 준비하고 있어요. 잠시 기다려 주세요',BUSY:'잠시 요청이 몰리고 있어요. 입력한 내용은 유지됩니다. 다시 보내주세요'};
  function status(t){els.status.textContent=t;}
  function message(role,text){const p=document.createElement('div');p.className='consult-message '+role;p.textContent=text;els.messages.append(p);}
  function render(){els.messages.replaceChildren();message('assistant','안녕하세요, 솟 모멘텀의 AI 상담 도우미입니다\n제작을 맡길지 정하지 않으셔도 괜찮아요\n주제·대본, 촬영, 편집 중 어떤 부분이 가장 고민되세요?');for(const m of state.messages||[])message(m.role,m.text);els.messages.scrollTop=els.messages.scrollHeight;els.send.disabled=busy||!!state.pending;els.summaryBtn.disabled=!(state.messages||[]).some(m=>m.role==='user');}
  function accept(result){Object.assign(state,result);persist();render();if(state.pending){status('이야기를 읽고 답변을 준비하고 있어요…');schedulePoll();}else{clearTimeout(timer);status('더 궁금한 점을 이야기하거나 PD와 이어서 상담하세요');}}
  function schedulePoll(){clearTimeout(timer);if(dialog.open&&state.pending)timer=setTimeout(poll,3500);}
  async function poll(){if(pollBusy)return;pollBusy=true;try{const wasPending=!!state.pending;accept(await api('poll'));if(wasPending&&!state.pending)event('ai_reply',{entry});}catch(e){status(errors[e.message]||'연결을 다시 확인하고 있어요. PD 직접 상담은 계속 이용할 수 있습니다');schedulePoll();}finally{pollBusy=false;}}
  function ensure(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='consult-dialog';dialog.setAttribute('aria-labelledby','consultTitle');
    dialog.innerHTML=`<div class="consult-shell"><header class="consult-head"><strong id="consultTitle">솟 모멘텀 · AI 제작 상담</strong><button type="button" class="consult-close" aria-label="상담창 닫기">×</button></header><p class="consult-disclosure">연락처 입력·결제 없이 시작하세요. 전송한 내용은 AI 응답을 위해 OpenAI로 전달되고 상담 기록으로 저장되며, 담당 PD가 확인할 수 있습니다. 개인정보·민감한 내용은 적지 않아도 됩니다. 보내기를 누르면 이 처리에 동의합니다.</p><div class="consult-messages" role="log" aria-label="상담 대화" aria-live="polite"></div><section class="consult-summary" hidden><strong>PD에게 전달할 내용을 확인해 주세요</strong><p>고객님이 말씀하신 내용을 모았습니다. 불필요한 내용은 지우고 수정하세요. 카카오톡에서 직접 붙여넣고 전송해야 PD에게 메시지가 도착합니다.</p><textarea id="consultSummaryText" aria-label="PD에게 전달할 상담 내용" maxlength="8000"></textarea><div class="consult-actions"><button type="button" class="consult-primary" data-copy-summary>내용 복사하기</button><a class="consult-secondary" data-summary-kakao href="${kakao}" target="_blank" rel="noopener noreferrer">카카오에서 이어서 상담하기</a><button type="button" class="consult-secondary" data-back>AI 대화로 돌아가기</button></div></section><div class="consult-status" role="status"></div><form class="consult-form"><textarea aria-label="제작 고민 입력" maxlength="1000" placeholder="예: 촬영할 시간이 부족해요" rows="2" required></textarea><button type="submit">보내기</button></form><div class="consult-footer"><button type="button" class="consult-secondary" data-summary>대화 정리하고 PD와 상담하기</button><a href="${kakao}" target="_blank" rel="noopener noreferrer">PD와 직접 상담하기</a><button type="button" class="consult-secondary" data-new>새 대화</button></div></div>`;
    document.body.append(dialog);els={messages:dialog.querySelector('.consult-messages'),status:dialog.querySelector('.consult-status'),form:dialog.querySelector('form'),input:dialog.querySelector('form textarea'),send:dialog.querySelector('form button'),summary:dialog.querySelector('.consult-summary'),summaryText:dialog.querySelector('#consultSummaryText'),summaryBtn:dialog.querySelector('[data-summary]')};
    dialog.querySelector('.consult-close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{clearTimeout(timer);document.body.classList.remove('consult-dialog-open');lastFocus?.focus();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    els.form.addEventListener('submit',send);
    els.summaryBtn.onclick=()=>{
      els.summaryText.value=('[솟 모멘텀 제작 상담]\n'+(state.messages||[]).filter(m=>m.role==='user').map(m=>'• '+m.text).join('\n')).slice(0,7900)+'\n\n제작 범위와 진행 가능 여부를 이야기하고 싶습니다';
      els.summary.hidden=false;els.messages.hidden=true;els.messages.style.display='none';els.form.hidden=true;els.form.style.display='none';event('ai_summary_view',{entry});els.summaryText.focus();status('내용을 복사하고 카카오에서 직접 보내주세요');
    };
    dialog.querySelector('[data-back]').onclick=()=>{els.summary.hidden=true;els.messages.hidden=false;els.messages.style.display='flex';els.form.hidden=false;els.form.style.display='flex';els.input.focus();};
    dialog.querySelector('[data-copy-summary]').onclick=async()=>{try{await navigator.clipboard.writeText(els.summaryText.value);status('복사했습니다. 카카오톡에서 붙여넣고 전송해 주세요');event('ai_summary_copy',{entry});}catch{els.summaryText.focus();els.summaryText.select();status('자동 복사가 어려워 내용을 선택했습니다. 직접 복사해 주세요');}};
    dialog.querySelector('[data-summary-kakao]').onclick=()=>{event('ai_kakao_open',{entry});if(state.id)api('handoff',{summary:els.summaryText.value}).catch(()=>{});};
    dialog.querySelector('[data-new]').onclick=()=>{if(busy||state.pending){status('진행 중 답변을 기다린 뒤 새 대화를 시작해 주세요');return;}state={token:token(),id:null,messages:[],expiresAt:Date.now()+86400000};pendingSend=null;persist();dialog.querySelector('[data-back]').click();render();status('새 대화를 시작합니다. 이전 기록은 담당 PD가 확인할 수 있습니다');};
  }
  async function send(e){
    e.preventDefault();if(busy||state.pending)return;const text=els.input.value.trim();if(!text)return;
    busy=true;els.send.disabled=true;status('상담을 연결하고 있어요…');
    if(!pendingSend||pendingSend.text!==text)pendingSend={requestId:crypto.randomUUID(),text};
    try{
      if(!state.id){const p=new URLSearchParams(location.search);const r=await api('start',{consent:true,channel:window._smChannelType,source:entry,ref:window._smConsultRef||'',test:p.get('admin')==='1'||location.hostname==='localhost'||location.hostname==='127.0.0.1'});Object.assign(state,r);persist();}
      const r=await api('send',pendingSend);els.input.value='';pendingSend=null;if(state.messages.length===0)event('ai_chat_start',{entry});busy=false;accept(r);
    }catch(e){status(errors[e.message]||'전송 결과를 확인하지 못했어요. 같은 내용으로 다시 보내면 중복 접수를 확인합니다');if(e.message==='CONSULT_UNAUTHORIZED'){state.id=null;state.token=token();state.pending=null;state.messages=[];persist();}}
    finally{busy=false;els.send.disabled=!!state.pending;}
  }
  document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-consult-open]');if(!button)return;e.preventDefault();ensure();lastFocus=button;entry=button.dataset.consultOpen||'page';dialog.showModal();document.body.classList.add('consult-dialog-open');render();els.input.focus();event('ai_chat_open',{entry});
    if(state.pending){poll();return;}
    status('연결 상태를 확인하고 있어요…');try{const s=await api('status');status(s.online?'편하게 이야기해 주세요. 결제나 예약은 진행되지 않습니다':errors.CONSULT_OFFLINE);}catch{status('연결 상태를 확인하지 못했어요. PD와 직접 상담하실 수도 있습니다');}
  });
  const seen=new Set();if('IntersectionObserver' in window){const observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting&&!seen.has(item.target.id)){seen.add(item.target.id);event('consult_section_view',{section:item.target.id});}},{threshold:0.25});for(const id of ['consult-check','consult-pricing']){const el=document.getElementById(id);if(el)observer.observe(el);}}
})();
