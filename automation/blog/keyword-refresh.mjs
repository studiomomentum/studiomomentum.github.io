import {chromium} from 'playwright';
import {search,trends} from './research-sources.mjs';
import {refreshVidiq} from './vidiq-keywords.mjs';

export function applySearch(group,rows){
 if(rows.length!==10||rows.some(s=>!s.results?.length))throw Error('SEARCH_UNAVAILABLE');
 return {...group,basis:'현재 등록된 관련 키워드 10개를 다시 검색했습니다. 고객 고민에 따른 편집 순서를 유지하며 검색량 순위가 아닙니다.',rows:group.rows.map(row=>{const s=rows.find(s=>s.keyword===row.keyword);if(!s)throw Error('SEARCH_UNAVAILABLE');return {...row,observedAt:s.observedAt,metric:'검색 글 표본 '+s.results.length+'개 · 검색량 미확인',detail:'제목에 검색어가 포함된 글 '+s.results.length+'개 중 '+s.results.filter(r=>r.readState==='body_excerpt').length+'개의 본문 앞부분을 확인했습니다. 표본 수는 경쟁도나 검색량이 아닙니다.',links:[{label:'네이버 검색 결과',url:s.url},...s.results.map(r=>({label:r.title,url:r.url}))]};})};
}
export function applyTrends(group,rows){
 if(rows.length!==10||rows.some(s=>s.state!=='observed'))throw Error('TREND_UNAVAILABLE');
 const updated=group.rows.map(row=>{const t=rows.find(t=>t.keyword===row.keyword);if(!t)throw Error('TREND_UNAVAILABLE');return {...row,observedAt:t.observedAt,metric:Number.isFinite(t.changePct)?'관심도 '+(t.changePct>=0?'+':'')+t.changePct.toFixed(1)+'% · 28일 비교':'판단 보류 · 직전 기간 기준값 0',detail:`최근 ${t.recentStart}~${t.recentEnd} 평균 상대지수 ${t.recentMean.toFixed(2)}, 직전 ${t.previousStart}~${t.previousEnd} ${t.previousMean.toFixed(2)}. 절대 검색량이 아닙니다. 기준값이 낮거나 0이 많으면 변화율 해석에 주의하세요.`,links:[{label:'데이터랩 비교 그래프',url:t.url}],change:t.changePct};});
 updated.sort((a,b)=>(b.change??-Infinity)-(a.change??-Infinity));return {...group,basis:'현재 등록된 관련 키워드 10개의 최근 28일 / 직전 28일 상대 관심도 변화율 내림차순입니다. 기준값 0은 판단 보류로 끝에 표시합니다.',rows:updated.map(({change,...row})=>row)};
}
export async function refreshGroup(group){
 if(group.id==='vidiq')return refreshVidiq(group);
 const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true,headless:true}),context=await browser.newContext();context.setDefaultTimeout(20000);
 try{
  if(group.id==='naver'){const rows=[];for(const row of group.rows)rows.push(await search(context,row.keyword));return applySearch(group,rows);}
  if(group.id==='datalab'){let rows=[];for(let i=0;i<group.rows.length;i+=5)rows.push(...await trends(context,group.rows.slice(i,i+5).map(r=>r.keyword)));return applyTrends(group,rows);}
  throw Error('SOURCE_INVALID');
 }finally{await browser.close();}
}
