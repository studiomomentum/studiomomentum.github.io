/* Source-specific research snapshots, loaded only through the authenticated content relay. */
window.MomentumKeywords=(()=>{
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const date=value=>new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 function render(root,board,onSelect){
  root.replaceChildren();root.append(el('h3','주제 발굴 · 키워드 TOP 10'));
  if(!board){root.append(el('p','아직 저장된 키워드 조사가 없습니다.'));return;}
  root.append(el('p','촬영·기획·외주 고민과 연결되는 키워드 · 조사 '+date(board.observedAt)+' · 저장된 조사 결과이며 자동 갱신되지 않습니다.'));
  const grid=el('div');grid.className='keyword-grid';
  for(const group of board.groups){
   const card=el('section');card.className='keyword-group';card.dataset.source=group.id;
   card.append(el('h4',group.title+' TOP 10'),el('p',group.basis));
   const list=el('ol');list.className='keyword-list';
   for(const row of group.rows){
    const item=el('li');item.className='keyword-row';const name=el('strong',row.keyword),metric=el('span',row.metric);metric.className='keyword-metric';
    item.append(name,metric);const detail=el('details');detail.append(el('summary',row.category+' · 근거와 주제 보기'),el('p',row.reason),el('p',row.question),el('p',row.detail),el('small','조회 '+date(row.observedAt)));
    const links=el('ul');for(const source of row.links){try{const url=new URL(source.url);if(url.protocol!=='https:')continue;const li=el('li'),a=el('a',source.label);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';li.append(a);links.append(li);}catch{}}
    detail.append(links);const use=el('button','이 키워드로 주제 준비');use.type='button';use.onclick=()=>onSelect(row,group);detail.append(use);item.append(detail);list.append(item);
   }
   card.append(list,el('p',group.limitations));grid.append(card);
  }
  root.append(grid);
 }
 return {render};
})();
