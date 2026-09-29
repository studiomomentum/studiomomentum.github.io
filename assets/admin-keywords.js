/* Source-specific research snapshots, loaded only through the authenticated content relay. */
window.MomentumKeywords=(()=>{
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const date=value=>new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 function render(root,board,onSelect,refreshes=[],onRefresh){
  root.replaceChildren();root.append(el('h3','주제 발굴 · 키워드 TOP 10'));
  if(!board){root.append(el('p','아직 저장된 키워드 조사가 없습니다.'));return;}
  root.append(el('p','촬영·기획·외주 고민과 연결되는 키워드 · 조사 '+date(board.observedAt)+' · 갱신 버튼으로 최신 자료를 요청할 수 있습니다.'));
  const grid=el('div');grid.className='keyword-grid';
  for(const group of board.groups){
   const card=el('section');card.className='keyword-group';card.dataset.source=group.id;
   const refresh=refreshes.find(r=>r.source===group.id),pending=['queued','running'].includes(refresh?.state);
   const header=el('div');header.className='content-toolbar';header.append(el('h4',group.title+' TOP 10'));
   const button=el('button',pending?'갱신 중…':'갱신하기');button.type='button';button.disabled=pending;button.setAttribute('aria-label',group.title+' 갱신하기');button.onclick=()=>onRefresh(group.id);header.append(button);card.append(header);
   const timer=el('p');timer.className='keyword-elapsed';timer.dataset.source=group.id;timer.dataset.observedAt=String(Math.max(...group.rows.map(r=>Date.parse(r.observedAt))));card.append(timer);
   if(refresh){const state=el('p',({queued:'갱신 대기 · PC 실행기 연결 후 처리',running:'갱신 중 · 기존 자료 표시',complete:'갱신 완료',failed:'갱신 실패 · 기존 자료와 경과 시간 유지'})[refresh.state]||'상태 확인 중');state.setAttribute('role','status');card.append(state);}
   card.append(el('p',group.basis));
   const result=refresh?.results?.find(r=>r.id===group.id);if(result){const errors={VIDIQ_MCP_QUERY_FAILED:'vidIQ 공식 조회 실패',VIDIQ_MCP_LOGIN_REQUIRED:'vidIQ 공식 연결 필요',VIDIQ_CREDITS_LOW:'vidIQ 잔여 크레딧 부족',VIDIQ_INTERRUPTED:'중단된 vidIQ 조회 · 중복 차감 방지를 위해 재시도하지 않음',VIDIQ_LOGIN_REQUIRED:'vidIQ 재로그인 필요',VIDIQ_SETUP_REQUIRED:'vidIQ 초기 설정 완료 필요',VIDIQ_ACCESS_REQUIRED:'현재 vidIQ 계정에서 키워드 지표 이용 권한 확인 필요',VIDIQ_PAGE_UNAVAILABLE:'vidIQ 화면 조회 실패',VIDIQ_METRICS_UNAVAILABLE:'vidIQ 지표 형식 확인 필요',SEARCH_UNAVAILABLE:'검색 결과 확인 실패',TREND_UNAVAILABLE:'데이터랩 조회 실패',SOURCE_TIMEOUT:'조회 시간 초과',WORKER_INTERRUPTED:'실행기 중단 후 재요청 필요'};card.append(el('p',result.state==='complete'?'이번 갱신 완료':'이전 자료 유지 · '+(errors[result.error]||'조회 실패. 로그인 또는 사이트 상태를 확인하세요.')));}

   const list=el('ol');list.className='keyword-list';
   for(const row of group.rows){
    const item=el('li');item.className='keyword-row';const name=el('strong',row.keyword),metric=el('span',row.metric);metric.className='keyword-metric';
    item.append(name,metric);const detail=el('details');detail.append(el('summary',row.category+' · 근거와 주제 보기'),el('p',row.reason),el('p',row.question),el('p',row.detail),el('small','조회 '+date(row.observedAt)));
    const links=el('ul');for(const source of row.links){try{const url=new URL(source.url);if(url.protocol!=='https:')continue;const li=el('li'),a=el('a',source.label);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';li.append(a);links.append(li);}catch{}}
    detail.append(links);const use=el('button','이 키워드로 주제 준비');use.type='button';use.onclick=()=>onSelect(row,group);detail.append(use);item.append(detail);list.append(item);
   }
   card.append(list,el('p',group.limitations));grid.append(card);
  }
  root.append(grid);tick(root);
 }
 function tick(root){for(const timer of root?.querySelectorAll('.keyword-elapsed')||[]){const stamp=Number(timer.dataset.observedAt);if(!Number.isFinite(stamp)){timer.textContent='마지막 갱신 시각 미확인';continue;}const minutes=Math.max(0,Math.floor((Date.now()-stamp)/60000)),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);timer.textContent='마지막 갱신 후 '+days+'일 '+hours+'시간 '+minutes%60+'분 경과 · '+date(stamp)+(timer.dataset.source==='vidiq'&&days>=7?' · 7일 경과, 필요할 때 수동 갱신':'');}}
 return {render,tick};
})();
