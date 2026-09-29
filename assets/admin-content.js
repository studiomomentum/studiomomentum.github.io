/* All content reads/writes use the existing authenticated relay. No public draft files. */
window.MomentumContent=(()=>{
  let data=null,selected=null,dirty=false,busy=false;
  const $=id=>document.getElementById(id), platforms={naver:'네이버',tistory:'티스토리',threads:'쓰레드'};
  const messages={INVALID_REQUEST:'콘텐츠 서버가 아직 배포되지 않았습니다.',CONTENT_CONFLICT:'다른 창에서 수정됐습니다. 입력을 복사해 보관한 뒤 다시 불러오세요.',CONTENT_BUSY:'이미 글을 생성하고 있습니다.',CONTENT_EXISTS:'기존 초안이 있어 다시 생성하지 않았습니다.',CONTENT_RECONCILE_REQUIRED:'실패한 생성 작업의 결과를 실행기에서 확인해야 합니다.',CONTENT_DUPLICATE:'같은 제목의 주제가 있습니다.',CONTENT_INVALID:'입력 내용과 길이를 확인해 주세요.'};
  function notice(text){$('contentNotice').textContent=text;}
  async function run(fn){if(busy)return;busy=true;root().setAttribute('aria-busy','true');try{await fn();}catch(e){notice(messages[e.code]||e.message||'처리하지 못했습니다.');}finally{busy=false;root().removeAttribute('aria-busy');}}
  function root(){return $('contentWorkspace');}
  function node(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
  function button(text,fn){const b=node('button',text);b.type='button';b.onclick=()=>run(fn);return b;}
  function dirtyGuard(){return !dirty||confirm('저장하지 않은 수정 내용이 있습니다. 다시 불러오면 사라집니다. 계속할까요?');}
  async function load(){if(!dirtyGuard())return;data=await MomentumAdmin.call('content.get');dirty=false;draw();notice('서버에 저장된 콘텐츠를 불러왔습니다.');}
  function draw(){
    const list=$('contentTopics');list.replaceChildren();
    if(!data.topics.length)list.append(node('p','아직 등록한 주제가 없습니다. 아래에서 중심 질문과 근거를 함께 등록하세요.'));
    for(const t of data.topics){const card=node('article');card.className='content-topic';
      const state=data.jobs.find(j=>j.topicId===t.id&&['queued','running','failed'].includes(j.state));
      card.append(node('h3',t.title),node('p',t.question),node('small',t.intent+' · 검색량 미확인 · '+({queued:'생성 대기',running:'생성 중',failed:'생성 실패'}[state?.state]|| (t.state==='unused'?'미사용':'초안 생성됨'))));
      const details=node('details');details.append(node('summary','근거·출처 보기'),node('p',t.evidence));card.append(details);
      if(state?.state==='failed')card.append(button('생성 재시도',async()=>{if(!dirtyGuard())return;data=await MomentumAdmin.call('content.retry',{topicId:t.id});dirty=false;draw();notice('실패한 생성 작업을 다시 요청했습니다.');}));
      card.append(button('선택',async()=>{if(!dirtyGuard())return;selected=t.id;dirty=false;drawEditor();}));list.append(card);
    }
    const online=data.workerSeenAt&&Date.now()-data.workerSeenAt<90000;
    $('contentWorker').textContent=online?'실행기 최근 연결됨':'실행기 연결 미확인 · 생성 요청은 대기열에 보관됩니다.';
    drawEditor();
  }
  function drawEditor(){
    const editor=$('contentEditor');editor.replaceChildren();
    const topic=data?.topics.find(t=>t.id===selected);if(!topic){editor.append(node('p','주제를 선택하면 매체별 글을 생성하거나 편집할 수 있습니다.'));return;}
    editor.append(node('h3',topic.title));
    const docs=Object.values(data.articles).filter(d=>d.topicId===selected);
    if(!docs.length){const job=data.jobs.find(j=>j.topicId===selected);editor.append(node('p',job?({queued:'실행기 연결을 기다리는 중입니다.',running:'글을 작성 중입니다. 잠시 뒤 결과를 불러오세요.',failed:'생성 실패. 실행기 결과를 확인해 주세요.'}[job.state]||'결과 확인 필요'):'선택한 주제와 근거로 세 매체의 초안을 작성합니다.'));
      if(!job)editor.append(button('세 매체 초안 생성',async()=>{data=await MomentumAdmin.call('content.generate',{topicId:selected});draw();notice('생성 요청을 저장했습니다. 발행은 하지 않습니다.');}));return;}
    editor.append(button('새 버전 생성',async()=>{if(!dirtyGuard())return;data=await MomentumAdmin.call('content.generate',{topicId:selected});dirty=false;draw();notice('이전 버전을 보존하고 새 버전 생성을 요청했습니다.');}));
    for(const group of [['블로그',['naver','tistory']],['쓰레드',['threads']]]){
      editor.append(node('h3',group[0]));const grid=node('div');grid.className='content-grid';
      for(const platform of group[1]){const doc=docs.find(d=>d.platform===platform);if(!doc)continue;
        let version=doc.versions.length;const last=doc.versions[version-1],card=node('article');card.className='content-draft';
        const status=node('p',doc.reviewedVersion===version?'검수 완료 · v'+version:'초안 · v'+version);status.className='content-state';
        const title=node('input');title.value=last.title;title.maxLength=200;title.setAttribute('aria-label',platforms[platform]+' 제목');
        const body=node('textarea');body.value=last.body;body.maxLength=50000;body.rows=16;body.setAttribute('aria-label',platforms[platform]+' 본문');
        const review=button('검수 완료',async()=>{data=await MomentumAdmin.call('content.review',{id:doc.id,version});drawEditor();notice('현재 저장 버전의 검수를 완료했습니다.');});
        review.disabled=dirty;
        const onInput=()=>{dirty=true;status.textContent='저장하지 않은 수정 · 검수 필요';root().querySelectorAll('[data-review]').forEach(b=>b.disabled=true);};title.oninput=body.oninput=onInput;review.dataset.review='true';
        const save=button('저장',async()=>{
          const result=await MomentumAdmin.call('content.save',{id:doc.id,version,title:title.value,body:body.value});
          // Update only this card: other media may contain unsaved edits.
          data=result;const next=result.articles[doc.id];doc.versions=next.versions;doc.reviewedVersion=next.reviewedVersion;version=next.versions.length;
          card.dataset.saved='true';title.dataset.saved=title.value;body.dataset.saved=body.value;
          dirty=[...root().querySelectorAll('input[data-saved],textarea[data-saved]')].some(e=>e.value!==e.dataset.saved);
          if(!dirty)drawEditor();else status.textContent='저장 완료 · v'+next.versions.length;
          notice('새 버전을 저장했습니다. 수정한 글의 검수 상태를 해제했습니다.');
        });
        title.dataset.saved=last.title;body.dataset.saved=last.body;
        // Saving another card changes its version; redraw before review when all cards are clean.
        card.append(node('h4',platforms[platform]),status,title,body,save,review);
        const preview=node('details');preview.append(node('summary','읽기 미리보기'));const rendered=node('div');rendered.className='content-preview';rendered.textContent=last.title+'\n\n'+last.body;preview.append(rendered);card.append(preview);
        const history=node('details');history.append(node('summary','저장 이력 ('+version+')'));
        doc.versions.forEach((v,i)=>{const item=node('details');item.append(node('summary','v'+(i+1)+' · '+new Date(v.createdAt).toLocaleString()),node('pre',v.title+'\n\n'+v.body));history.append(item);});card.append(history);grid.append(card);
      }editor.append(grid);
    }
    editor.append(node('p','발행 연결은 다음 단계입니다. 검수 완료는 실제 게시를 의미하지 않습니다.'));
  }
  function mount(){
    if(root().dataset.mounted)return;root().dataset.mounted='true';
    const header=node('div');header.className='content-toolbar';header.append(node('h2','콘텐츠 관리'),button('결과 불러오기',load));
    const worker=node('p');worker.id='contentWorker';const msg=node('p','주제 선택 → 초안 생성 → 편집·저장 → 매체별 검수');msg.id='contentNotice';msg.setAttribute('role','status');
    const topics=node('div');topics.id='contentTopics';topics.className='content-topics';
    const add=node('details');add.append(node('summary','주제 등록'));const form=node('form');
    for(const [name,label,max] of [['title','주제',180],['question','독자의 고민·중심 질문',1000],['intent','검색 의도 (문제 인식 / 해결 탐색 / 구매 검토 / 업체 선택)',60],['evidence','근거·출처·확인일 (미검증이면 가설이라고 명시)',10000]]){const l=node('label',label),input=node(name==='evidence'?'textarea':'input');input.name=name;input.required=true;input.maxLength=max;l.append(input);form.append(l);}
    const submit=node('button','주제 저장');submit.type='submit';form.append(submit);form.onsubmit=e=>{e.preventDefault();run(async()=>{if(!dirtyGuard())return;data=await MomentumAdmin.call('content.topic.add',Object.fromEntries(new FormData(form)));dirty=false;form.reset();draw();notice('주제를 등록했습니다. 기존 글과 검색 의도 중복을 검토한 뒤 선택하세요.');});};add.append(form);
    const suggestions=node('details');suggestions.append(node('summary','기획서 기반 추천 주제 · 검색 근거 미검증'));
    for(const [title,question] of [ ['촬영 전에 대본에서 먼저 정할 세 가지','전문 지식은 많은데 카메라 앞에서 설명이 길어지는 이유는 무엇인가?'],['유튜브 편집 외주를 맡겨도 일이 줄지 않는 이유','수정 요청이 반복될 때 기획 단계에서 무엇을 합의해야 하는가?'],['대표님 셀프 촬영, 장비보다 먼저 확인할 것','혼자 촬영을 시작할 때 무엇부터 점검해야 하는가?']]){
      suggestions.append(button(title,async()=>{if(!dirtyGuard())return;data=await MomentumAdmin.call('content.topic.add',{title,question,intent:'해결 탐색',evidence:'v1 기획서의 고객 고민과 PD 제작 관점을 바탕으로 한 기획 가설. 외부 검색 근거·검색량·성과 수치는 미검증. 실제 고객 사례로 서술하지 않음.'});selected=data.topics[data.topics.length-1].id;dirty=false;draw();notice('기획 가설을 등록했습니다. 근거를 검토한 뒤 생성을 선택하세요.');}));
    }
    const editor=node('section');editor.id='contentEditor';root().append(header,worker,msg,suggestions,topics,add,editor);
  }
  function open(){mount();if(!data)run(load);}
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  return {open};
})();
