export const platforms=['naver','tistory','threads'];
export const formats=['설명형','방법·절차형','비교형','문제 진단형','체크리스트형','질문·답변형','오해 교정형','선택 가이드형'];
export function seoulDate(time){return new Date(time+9*3600000).toISOString().slice(0,10);}
export function slotTime(date,hour){return Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00+09:00`);}
export function dueSlots(config,now){
  const date=seoulDate(now);
  return config.hours.map(hour=>({key:`${date}-${hour}`,date,hour,time:slotTime(date,hour)}))
    .filter(s=>s.time>=config.startAt&&now>=s.time-30*60000&&now<=s.time+2*3600000);
}
export function validateConfig(c){
  if(c?.enabled!==true)return false;
  if(c.timezone!=='Asia/Seoul'||JSON.stringify(c.hours)!=='[10,18]'||!Number.isFinite(c.startAt)||!c.adminFile||!c.stateFile||!c.metricsFile)throw Error('AUTOPILOT_CONFIG_INVALID');
  return true;
}
export function validatePlan(plan,existing=[]){
  if(!plan||!Array.isArray(plan.topics)||plan.topics.length!==2)throw Error('AUTOPILOT_PLAN_INVALID');
  const seen=new Set(existing.map(t=>t.title.replace(/\s/g,'')));
  for(const t of plan.topics){
    for(const k of ['title','question','intent','evidence'])if(typeof t[k]!=='string'||!t[k].trim())throw Error('AUTOPILOT_PLAN_INVALID');
    if(t.title.length>180||t.question.length>1000||t.evidence.length>9000||t.intent.length>60)throw Error('AUTOPILOT_PLAN_INVALID');
    const key=t.title.replace(/\s/g,'');if(seen.has(key))throw Error('AUTOPILOT_TOPIC_DUPLICATE');seen.add(key);
    for(const p of platforms)if(!formats.includes(t.formats?.[p]))throw Error('AUTOPILOT_PLAN_INVALID');
    if(typeof t.theme!=='string'||!t.theme.trim()||t.theme.length>100)throw Error('AUTOPILOT_PLAN_INVALID');
  }
  return plan;
}
function median(values){const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
export function performanceSummary(metrics,state){
  const rows=[];
  for(const day of Object.values(state.days||{}))for(const slot of Object.values(day.slots||{})){
    for(const p of platforms){
      const post=slot.posts?.[p];if(!post?.url||!post.publishedAt)continue;
      const samples=(metrics.samples||[]).filter(s=>s.url===post.url&&s.platform===p&&s.status==='ok'&&Number.isFinite(s.views)&&Math.abs((s.observedAt-post.publishedAt)/3600000-24)<=4);
      samples.sort((a,b)=>Math.abs(a.observedAt-post.publishedAt-86400000)-Math.abs(b.observedAt-post.publishedAt-86400000));
      if(samples[0])rows.push({platform:p,format:slot.topic.formats[p],theme:slot.topic.theme||'미분류',views:samples[0].views,ageHours:(samples[0].observedAt-post.publishedAt)/3600000});
    }
  }
  return platforms.map(platform=>({platform,comparison:'게시 약 24시간(20~28시간), 매체 내 비교만 사용',themes:[...new Set(rows.filter(r=>r.platform===platform).map(r=>r.theme))].map(theme=>{const samples=rows.filter(r=>r.platform===platform&&r.theme===theme);return {theme,count:samples.length,medianViews:samples.length>=3?median(samples.map(r=>r.views)):null};}),formats:formats.map(format=>{
    const samples=rows.filter(r=>r.platform===platform&&r.format===format);
    return {format,count:samples.length,medianViews:samples.length>=3?median(samples.map(r=>r.views)):null};
  })}));
}
export function checkScheduledArticle(platform,a){
  if(!a||typeof a.title!=='string'||typeof a.body!=='string'||a.title.length>200||a.body.trim().length<50)throw Error('AUTOPILOT_REVIEW_FAILED');
  if(platform==='threads'&&([...a.body].length>500||/(?:https?:\/\/|www\.)/i.test(a.body)))throw Error('AUTOPILOT_REVIEW_FAILED');
  if(platform!=='threads'&&!a.body.includes('https://studiomomentum.github.io/'))throw Error('AUTOPILOT_REVIEW_FAILED');
  if(/PROMPT_GENERATION|G17|내부 프롬프트|자동화 구조|조회수 보장|매출 보장|문의 보장/.test(a.body))throw Error('AUTOPILOT_REVIEW_FAILED');
  return true;
}
