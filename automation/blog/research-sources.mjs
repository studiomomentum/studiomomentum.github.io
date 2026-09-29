import {chromium} from 'playwright';

export function trendSummary(points){
 const rows=points.filter(p=>Number.isFinite(p.value)&&p.value>=0&&p.value<=100).sort((a,b)=>a.date.localeCompare(b.date));
 if(rows.length<56)return {state:'unavailable',reason:'INSUFFICIENT_DAYS'};
 const mean=a=>a.reduce((n,p)=>n+p.value,0)/a.length;
 const recent=rows.slice(-28),previous=rows.slice(-56,-28),a=mean(recent),b=mean(previous);
 return {state:'observed',unit:'relative_index',recentStart:recent[0].date,recentEnd:recent.at(-1).date,previousStart:previous[0].date,previousEnd:previous.at(-1).date,recentMean:a,previousMean:b,changePct:b>0?(a/b-1)*100:null,points:rows};
}

// Only visible search-result links to individual blog posts; ads/profile links excluded.
export function searchLinks(anchors,keyword){
 const found=new Map();
 for(const a of anchors){
  const url=a.href.split('?')[0],title=a.innerText.replace(/새 창 열림/g,'').replace(/\s+/g,' ').trim();
  if(!/^https:\/\/(?:[m.]*blog\.naver\.com\/[^/]+\/\d+|[^/.]+\.tistory\.com\/(?:\d+|entry\/[^/]+))$/.test(url)||title.length<8||title.length>180)continue;
  if(keyword&&!keyword.split(/\s+/).every(term=>title.replace(/\s/g,'').includes(term.replace(/\s/g,''))))continue;
  if(!found.has(url)||title.length<found.get(url).title.length)found.set(url,{title,url});
 }
 return [...found.values()].slice(0,3);
}

export async function search(context,keyword){
 const page=await context.newPage(),url='https://search.naver.com/search.naver?query='+encodeURIComponent(keyword);
 try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded'});if(!response?.ok())throw Error('SEARCH_UNAVAILABLE');
  if(/비정상적인 접근|자동입력 방지/.test(await page.locator('body').innerText()))throw Error('SEARCH_USER_ACTION_REQUIRED');
  const results=await page.locator('a[href]').evaluateAll(searchLinks,keyword);
  for(const result of results){
   const detail=await context.newPage();
   try{
    const mobile=result.url.replace('https://blog.naver.com/','https://m.blog.naver.com/');
    const response=await detail.goto(mobile,{waitUntil:'domcontentloaded',timeout:20000});if(!response?.ok())throw Error();
    const body=detail.locator('.se-main-container, .tt_article_useless_p_margin, #postViewArea').first();
    await body.waitFor({timeout:8000});result.excerpt=(await body.innerText()).replace(/\s+/g,' ').slice(0,900);result.readState='body_excerpt';
   }catch{result.readState='search_title_only';}
   finally{await detail.close();}
  }
  return {keyword,url,observedAt:new Date().toISOString(),state:results.length?'observed':'unavailable',results};
 }finally{await page.close();}
}

export async function trends(context,keywords){
 const page=await context.newPage();
 try{
  await page.goto('https://datalab.naver.com/keyword/trendSearch.naver',{waitUntil:'domcontentloaded'});
  for(let i=0;i<keywords.length;i++){await page.locator('#item_keyword'+(i+1)).fill(keywords[i]);await page.locator('#item_sub_keyword'+(i+1)+'_1').fill(keywords[i]);}
  await page.getByText('3개월',{exact:true}).click();await page.getByText('네이버 검색 데이터 조회',{exact:false}).click();
  await page.waitForURL('**/trendResult.naver?**');await page.locator('svg .bb-circle').first().waitFor({state:'attached'});
  // Read the data attached to rendered chart points, without calling private endpoints.
  const points=await page.locator('svg .bb-circle').evaluateAll(els=>els.map(e=>e.__data__).filter(Boolean).map(d=>({series:d.id,date:new Date(new Date(d.x).getTime()+9*3600000).toISOString().slice(0,10),value:d.value})));
  return keywords.map((keyword,i)=>({keyword,url:page.url(),observedAt:new Date().toISOString(),...trendSummary(points.filter(p=>p.series==='data'+i))}));
 }finally{await page.close();}
}

export async function collectNaver(keywords){
 if(!Array.isArray(keywords)||keywords.length<1||keywords.length>5||keywords.some(k=>typeof k!=='string'||!k.trim()||k.length>30))throw Error('RESEARCH_KEYWORDS_INVALID');
 const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true,headless:true});const context=await browser.newContext();context.setDefaultTimeout(20000);
 try{
  const searches=[];for(const keyword of keywords){try{searches.push(await search(context,keyword));}catch{searches.push({keyword,state:'unavailable',results:[]});}}
  let trendRows;try{trendRows=await trends(context,keywords);}catch{trendRows=keywords.map(keyword=>({keyword,state:'unavailable',reason:'TREND_UNAVAILABLE'}));}
  return {searches,trends:trendRows,naverMonthlySearches:null};
 }finally{await browser.close();}
}
