/* Private conversations are fetched only through the existing authenticated admin relay. */
(() => {
  const host=document.getElementById('dashboardApp');if(!host)return;
  const box=document.createElement('details');box.style.cssText='margin:20px;padding:18px;border:1px solid #475569;border-radius:12px;background:#0f172a;color:#e2e8f0';
  box.innerHTML='<summary style="cursor:pointer;font-weight:700">AI 상담 기록 · 고객의 고민과 실제 문의</summary><p style="font-size:13px">카카오 이동은 실제 문의 도착과 다릅니다. 실제 메시지를 받은 상담만 ‘문의 도착 확인’으로 표시하세요. 테스트 대화는 통계에서 제외합니다.</p><button type="button" data-load>상담 기록 불러오기</button><span data-status role="status" style="margin-left:12px"></span><div data-list></div>';
  host.append(box);const status=box.querySelector('[data-status]'),list=box.querySelector('[data-list]'),button=box.querySelector('[data-load]');
  button.onclick=async()=>{
    button.disabled=true;status.textContent='불러오는 중…';
    try{
      const data=await MomentumAdmin.call('consult.list');list.replaceChildren();
      const real=data.sessions.filter(s=>!s.test);status.textContent=(data.online?'AI 연결됨':'AI 연결 대기')+' · 최근 실제 상담 '+real.length+' · 카카오 이동 '+real.filter(s=>s.kakaoOpenedAt).length+' · 문의 도착 확인 '+real.filter(s=>s.contactedAt).length;
      for(const s of data.sessions){
        const row=document.createElement('details');row.style.cssText='margin-top:12px;padding:12px;background:#1e293b;border-radius:8px';
        const title=document.createElement('summary');title.textContent=(s.test?'[테스트] ':'')+new Date(s.createdAt).toLocaleString('ko-KR')+' · '+s.channel+' · '+(s.messages.find(m=>m.role==='user')?.text||'대화 전').slice(0,70);row.append(title);
        const text=document.createElement('pre');text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:1.8';text.textContent=s.messages.map(m=>(m.role==='user'?'고객: ':'AI: ')+m.text).join('\n\n')+(s.customerSummary?'\n\n고객이 확인·수정한 전달 내용:\n'+s.customerSummary:'');row.append(text);
        const mark=document.createElement('button');mark.type='button';mark.textContent=s.contactedAt?'실제 문의 도착 확인됨':'실제 문의 도착 확인';mark.disabled=!!s.contactedAt;
        mark.onclick=async()=>{if(!confirm('이 상담 고객의 실제 카카오 메시지를 받았나요?'))return;mark.disabled=true;try{await MomentumAdmin.call('consult.contact.confirm',{id:s.id});mark.textContent='실제 문의 도착 확인됨';}catch(e){mark.disabled=false;status.textContent=e.message;}};row.append(mark);list.append(row);
      }
    }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
  };
  window.addEventListener('momentum-auth-cleared',()=>{list.replaceChildren();status.textContent='';box.open=false;});
})();
