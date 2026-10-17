import {openBrowser} from './browser.mjs';
import {openEditor} from './tistory-draft.mjs';

export function parseViews(value){
  const m=String(value).trim().replace(/,/g,'').match(/^(\d+(?:\.\d+)?)\s*(K|M|천|만)?$/i);
  if(!m)return null;
  const n=Number(m[1])*({k:1000,m:1000000,'천':1000,'만':10000}[m[2]?.toLowerCase()]||1);
  return Number.isSafeInteger(n)&&n>=0?n:null;
}
export function threadViewRows(rows){
  return rows.flatMap(r=>{
    const id=r.url.match(/\/insights\/post\/([\w-]+)/)?.[1];
    const m=r.text.match(/([\d,.]+(?:\s*[KM천만])?)\s*(?:Views|조회(?:수)?)\s*$/i);
    const views=m?parseViews(m[1]):null;
    return id&&views!==null?[{url:`https://www.threads.com/@sot_momentum/post/${id}`,views,raw:m[1]}]:[];
  });
}
async function naverViews(c,post){
  const id=new URL(post.url).pathname.match(/^\/sot_momentum\/(\d+)$/)?.[1];if(!id)throw Error('POST_URL_INVALID');
  const p=await c.newPage();try{
    const loaded=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/blog/article/cv',{timeout:20000}).catch(()=>null);
    await p.goto(`https://blog.stat.naver.com/m/blog/article/${id}/cv`,{waitUntil:'domcontentloaded',timeout:30000});
    const response=await loaded;if(!response)throw Error('METRIC_NOT_VERIFIED');
    const data=await response.json();
    const blocks=data?.result?.statDataList;
    const info=blocks?.find(x=>x.dataId==='articleInfo')?.data?.value;
    const dashboard=blocks?.find(x=>x.dataId==='dashboard')?.data?.value;
    const views=dashboard?.cvTotal;
    if(data.statusCode!==200||!info?.url?.includes(`/sot_momentum/${id}`)||!Number.isSafeInteger(views)||views<0)throw Error('METRIC_NOT_VERIFIED');
    return {views,source:p.url(),platformUpdatedAt:dashboard.utime||null};
  }finally{await p.close();}
}
async function tistoryViews(c,post){
  const id=new URL(post.url).pathname.match(/^\/(\d+)$/)?.[1];if(!id)throw Error('POST_URL_INVALID');
  const p=await c.newPage();try{
    const loaded=p.waitForResponse(r=>new URL(r.url()).pathname==='/manage/v2/statistics/entry/base',{timeout:20000}).catch(()=>null);
    await p.goto(`https://sotmomentum.tistory.com/manage/statistics/entry/${id}`,{waitUntil:'domcontentloaded',timeout:30000});
    const response=await loaded;if(!response?.ok())throw Error('METRIC_NOT_VERIFIED');
    const data=await response.json(),views=data.data?.count;
    if(data.status!=='ok'||data.data.permalink!==post.url||!Number.isSafeInteger(views)||views<0)throw Error('METRIC_NOT_VERIFIED');
    return {views,source:p.url(),platformUpdatedAt:data.data.lastUpdateTime||null};
  }finally{await p.close();}
}
async function threadsViews(c){
  const p=await c.newPage();try{
    await p.goto('https://www.threads.com/@sot_momentum',{waitUntil:'domcontentloaded',timeout:30000});
    await p.getByText('View insights',{exact:true}).or(p.getByText('인사이트 보기',{exact:true})).first().click({timeout:15000});
    await p.locator('a[href*="/insights/post/"]').first().waitFor({timeout:20000});
    return threadViewRows(await p.locator('a[href*="/insights/post/"]').evaluateAll(es=>es.map(e=>({url:e.href,text:e.innerText}))));
  }finally{await p.close();}
}
export async function collectViewMetrics(posts,settings){
  const samples=[],c=await openBrowser(settings.profile);
  const record=(post,value)=>samples.push({platform:post.platform,url:post.url,observedAt:Date.now(),scope:'cumulative',...value});
  try{
    let threadsData,threadsError;
    if(posts.some(p=>p.platform==='threads'))try{threadsData=await threadsViews(c);}catch(e){threadsError=e;}
    let tistoryReady=false;
    for(const post of posts){
      try{
        let metric;
        if(post.platform==='naver')metric=await naverViews(c,post);
        else if(post.platform==='tistory'){
          if(!tistoryReady){const editor=await openEditor(c,settings.accountName);await editor.close();tistoryReady=true;}
          metric=await tistoryViews(c,post);
        }else{
          if(threadsError)throw threadsError;
          const row=threadsData.find(x=>x.url===post.url);if(!row)throw Error('METRIC_NOT_VISIBLE');
          metric={views:row.views,raw:row.raw,source:'https://www.threads.com/insights'};
        }
        record(post,{status:'ok',...metric});
      }catch(e){record(post,{status:'unavailable',views:null,error:/^[A-Z_]+$/.test(e.message)?e.message:'LOGIN_OR_STATISTICS_CHECK_REQUIRED'});}
    }
  }finally{await c.close();}
  return samples;
}
