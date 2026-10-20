'use strict';
window.PublishedPostViewer=(()=>{
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 let dialog,posts=[],active=0,opener=null,mode='published';
 function ensure(){
  if(dialog)return;
  dialog=make('dialog');dialog.className='published-post-dialog';dialog.setAttribute('aria-labelledby','publishedPostHeading');
  const header=make('header'),heading=make('h2','게시된 글');heading.id='publishedPostHeading';
  const close=make('button','닫기');close.type='button';close.setAttribute('aria-label','게시글 닫기');close.onclick=()=>dialog.close();
  header.append(heading,close);const tabs=make('nav');tabs.setAttribute('aria-label','게시된 글 매체');
  const content=make('article');content.className='published-post-content';dialog.append(header,tabs,content);document.body.append(dialog);
  dialog.addEventListener('close',()=>{posts=[];content.replaceChildren();tabs.replaceChildren();opener?.isConnected&&opener.focus();});
 }
 function image(item){
  const figure=make('figure'),img=make('img');
  if(!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(item.src||''))return null;
  img.src=item.src;img.alt=item.role||'게시글 첨부 이미지';img.loading='lazy';figure.append(img);return figure;
 }
 function textBlock(target,text){
  const expression=/https:\/\/[^\s<>]+/g;let start=0;
  for(const match of text.matchAll(expression)){
   target.append(document.createTextNode(text.slice(start,match.index)));let url;
   try{url=new URL(match[0]);}catch{}
   if(url&&url.protocol==='https:'&&!url.username&&!url.password){const a=make('a',match[0]);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer sponsored';target.append(a);}
   else target.append(document.createTextNode(match[0]));start=match.index+match[0].length;
  }
  target.append(document.createTextNode(text.slice(start)));
 }
 function body(target,text,media=[]){
  const used=new Set();
  for(const part of String(text||'').split(/\n\s*\n/)){
   if(!part.trim())continue;
   const marked=media.find(m=>m.marker===part.trim());
   if(marked){const pic=image(marked);if(pic)target.append(pic);used.add(marked);continue;}
   if(/^\[\[(?:BLOG_IMAGE_\d+|OFFICIAL_IMAGE)\]\]$/.test(part.trim())){target.append(make('p','첨부 이미지 저장본 없음'));continue;}
   const heading=part.match(/^(#{2,3}) (.*)$/s),el=make(heading?(heading[1].length===2?'h3':'h4'):'p');
   textBlock(el,heading?heading[2]:part);target.append(el);
  }
  for(const item of media){if(used.has(item))continue;const pic=image(item);if(pic)target.append(pic);}
 }
 function draw(){
  const nav=dialog.querySelector('nav'),content=dialog.querySelector('article');nav.replaceChildren();content.replaceChildren();
  for(const [i,post]of posts.entries()){const b=make('button',(post.label||post.channel)+' · v'+(post.version||1));b.type='button';b.setAttribute('aria-pressed',String(i===active));b.onclick=()=>{active=i;draw();};nav.append(b);}
  nav.hidden=posts.length<2;
  const post=posts[active];if(!post)return;
  const info=make('p',(mode==='draft'?'저장 원고 · ':'게시 완료 · ')+(post.label||post.channel)+(mode==='draft'?' · 저장 버전 v':' · 게시한 버전 v')+(post.version||1));info.className='published-post-meta';content.append(info);
  if(post.published_at){const date=new Date(post.published_at);if(Number.isFinite(date.getTime()))content.append(make('small',date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})));}
  if(post.title&&!['threads','x'].includes(post.channel))content.append(make('h2',post.title));
  body(content,post.body,post.body_media);
  if(post.first_comment){const comment=make('section');comment.className='published-post-comment';comment.append(make('h3','첫 댓글'));body(comment,post.first_comment,post.comment_media);content.append(comment);}
  if(post.missing_media_count)content.append(make('p','일부 이전 첨부 이미지의 저장본이 없습니다.'));
  content.append(make('p',mode==='draft'?'현재 저장된 버전의 원고입니다.':'공개 확인된 발행 버전의 원고입니다.'));content.lastElementChild.className='published-post-meta';
 }
 function open(value){ensure();mode=value.mode==='draft'?'draft':'published';posts=value.posts||[];if(!posts.length)return;active=Math.max(0,posts.findIndex(p=>p.id===value.selectedId));opener=document.activeElement;dialog.querySelector('h2').textContent=value.project+(mode==='draft'?' · 저장 원고':' · 게시된 글');dialog.querySelector('header button').setAttribute('aria-label',mode==='draft'?'원고 닫기':'게시글 닫기');draw();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}
 function clear(){if(dialog?.open)dialog.close();posts=[];dialog?.querySelector('article').replaceChildren();}
 window.addEventListener('ops-cleared',clear);window.addEventListener('momentum-auth-cleared',clear);
 return {open,clear};
})();
