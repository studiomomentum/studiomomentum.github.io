import {connectVidiq,unpack} from './vidiq-mcp.mjs';
import {framing} from './keyword-framing.mjs';
const seeds=['유튜브 기획','유튜브 촬영','영상 편집 외주','유튜브 마케팅'];
export function buildVidiqGroup(group,batches,observedAt=new Date().toISOString()){
 if(batches.length!==4)throw Error('VIDIQ_METRICS_UNAVAILABLE');
 const latest=new Map();
 for(const batch of batches){if(!batch.seedKeyword||!Array.isArray(batch.relatedKeywords))throw Error('VIDIQ_METRICS_UNAVAILABLE');for(const row of [batch.seedKeyword,...batch.relatedKeywords]){if(!row?.keyword)continue;const key=row.keyword.replace(/\s/g,'');const prev=latest.get(key);if(!prev||Date.parse(row.metricsAsOf)>Date.parse(prev.metricsAsOf))latest.set(key,row);}}
 const rows=[...latest.values()].filter(r=>framing[r.keyword]&&Number.isFinite(r.overall)&&r.overall>=0&&r.overall<=100&&Number.isFinite(r.volume)&&Number.isFinite(r.competition)&&Number.isFinite(r.estimatedMonthlySearch)&&Number.isFinite(Date.parse(r.metricsAsOf))&&Date.parse(observedAt)-Date.parse(r.metricsAsOf)>=0&&Date.parse(observedAt)-Date.parse(r.metricsAsOf)<=30*86400000).sort((a,b)=>b.overall-a.overall).slice(0,10).map(r=>{const [category,reason,question]=framing[r.keyword];return {keyword:r.keyword,category,reason:'기획 제안: '+reason,question,observedAt,metric:'기회 점수 '+r.overall.toFixed(1)+'/100 · 월 '+r.estimatedMonthlySearch.toLocaleString('ko-KR')+'회 추정',detail:'vidIQ 유튜브 전 세계 추정치. 지표 기준 '+r.metricsAsOf.slice(0,10)+', 검색 수요 점수 '+r.volume.toFixed(1)+'/100, 경쟁 점수 '+r.competition.toFixed(1)+'/100. 네이버 검색량이나 한국의 확정 검색 횟수가 아닙니다.',links:[{label:'vidIQ 키워드 조사',url:'https://app.vidiq.com/research/explore?tab=keywords'},{label:'유튜브 검색 결과',url:'https://www.youtube.com/results?search_query='+encodeURIComponent(r.keyword)}]};});
 if(rows.length!==10)throw Error('VIDIQ_METRICS_UNAVAILABLE');
 return {...group,basis:'기획·촬영·편집 외주·마케팅 네 분야를 공식 MCP로 조회하고, 사전에 정한 사업 관련어 중 30일 이내 지표의 기회 점수 상위 10개를 선정했습니다.',limitations:'전 세계 유튜브의 vidIQ 추정 지표입니다. 전체 키워드 순위·블로그 경쟁도가 아니며 조회수나 문의를 보장하지 않습니다. 갱신 1회는 4회 조회, 최대 20크레딧입니다.',rows};
}
export async function refreshVidiq(group){
 const client=await connectVidiq();try{
  const balance=unpack(await client.callTool({name:'vidiq_balance',arguments:{}}));
  if(balance.type!=='unlimited'&&(!Number.isFinite(balance.totalCredits)||balance.totalCredits<20))throw Error('VIDIQ_CREDITS_LOW');
  const batches=[];for(const keyword of seeds)batches.push(unpack(await client.callTool({name:'vidiq_keyword_research',arguments:{mode:'research',keyword,includeRelated:true,country:'KR'}})));
  return buildVidiqGroup(group,batches);
 }finally{await client.close();}
}
