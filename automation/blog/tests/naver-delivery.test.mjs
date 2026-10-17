import test from 'node:test';import assert from 'node:assert/strict';
import {sameNaverLines,naverPostURL,canonicalNaverPostURL,naverDelivery} from '../naver-delivery.mjs';
test('Naver verification rejects lost paragraph breaks and edited text',()=>{
 assert(sameNaverLines(['첫 문단','','둘째 문단'],'첫 문단\n\n둘째 문단'));
 assert(!sameNaverLines(['첫 문단둘째 문단'],'첫 문단\n\n둘째 문단'));
 assert(!sameNaverLines(['첫 문단','','다른 문단'],'첫 문단\n\n둘째 문단'));
});
test('Naver result URL only permits configured blog posts',()=>{
 assert(naverPostURL('https://blog.naver.com/sot_momentum/123'));
 for(const u of ['https://blog.naver.com/other/123','https://blog.naver.com/sot_momentum/postwrite','https://blog.naver.com.evil.test/sot_momentum/123'])assert(!naverPostURL(u));
});
test('Unknown delivery kinds cannot open a browser or publish',async()=>{
 await assert.rejects(()=>naverDelivery({}, {kind:'delete'},{}),/DELIVERY_KIND_INVALID/);
});

test('Legacy target jobs cannot use the new account',async()=>{await assert.rejects(()=>naverDelivery({}, {kind:'draft',target:'jungkkuckma'},{}),/WRONG_BLOG/);assert(!naverPostURL('https://blog.naver.com/jungkkuckma/123'));});

test('query-form and mobile Naver URLs canonicalize only for the configured account',()=>{
 for(const url of ['https://blog.naver.com/PostView.naver?blogId=sot_momentum&logNo=123','https://m.blog.naver.com/sot_momentum/123?tracking=x','https://blog.naver.com/sot_momentum/123'])assert.equal(canonicalNaverPostURL(url),'https://blog.naver.com/sot_momentum/123');
 for(const url of ['https://blog.naver.com/PostView.naver?blogId=other&logNo=123','https://evil.test/PostView.naver?blogId=sot_momentum&logNo=123','https://blog.naver.com/PostWrite.naver?blogId=sot_momentum&logNo=123','https://blog.naver.com/sot_momentum/postwrite','http://blog.naver.com/sot_momentum/123'])assert.equal(canonicalNaverPostURL(url),null);
});
