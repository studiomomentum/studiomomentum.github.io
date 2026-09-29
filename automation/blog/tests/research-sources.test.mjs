import test from 'node:test';import assert from 'node:assert/strict';import {trendSummary,searchLinks} from '../research-sources.mjs';
test('trend compares two 28-day windows, preserves absent baseline and does not turn it into growth',()=>{
const rows=Array.from({length:56},(_,i)=>({date:new Date(Date.UTC(2026,6,1+i)).toISOString().slice(0,10),value:i<28?10:15}));assert.equal(trendSummary(rows).changePct,50);assert.equal(trendSummary(rows.map(r=>({...r,value:0}))).changePct,null);assert.equal(trendSummary(rows.slice(0,20)).state,'unavailable');
});
test('search collector excludes ads/profiles and unrelated titles, deduplicates snippets',()=>{
const links=[{href:'https://blog.naver.com/a',innerText:'유튜브 촬영 블로그'},{href:'https://ad.naver.com/a',innerText:'유튜브 촬영 광고'},{href:'https://blog.naver.com/a/123',innerText:'유튜브 촬영 준비 방법 새 창 열림'},{href:'https://blog.naver.com/b/456',innerText:'유튜브 결제 문의 방법'},{href:'https://blog.naver.com/a/123',innerText:'유튜브 촬영 준비 방법에 대한 긴 설명입니다'}];assert.deepEqual(searchLinks(links,'유튜브 촬영'),[{title:'유튜브 촬영 준비 방법',url:'https://blog.naver.com/a/123'}]);
});
