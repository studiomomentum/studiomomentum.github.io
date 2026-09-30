import test from 'node:test';import assert from 'node:assert/strict';
import {sameNaverLines,naverPostURL,naverDelivery} from '../naver-delivery.mjs';
test('Naver verification rejects lost paragraph breaks and edited text',()=>{
 assert(sameNaverLines(['첫 문단','','둘째 문단'],'첫 문단\n\n둘째 문단'));
 assert(!sameNaverLines(['첫 문단둘째 문단'],'첫 문단\n\n둘째 문단'));
 assert(!sameNaverLines(['첫 문단','','다른 문단'],'첫 문단\n\n둘째 문단'));
});
test('Naver result URL only permits configured blog posts',()=>{
 assert(naverPostURL('https://blog.naver.com/jungkkuckma/123'));
 for(const u of ['https://blog.naver.com/other/123','https://blog.naver.com/jungkkuckma/postwrite','https://blog.naver.com.evil.test/jungkkuckma/123'])assert(!naverPostURL(u));
});
test('Unknown delivery kinds cannot open a browser or publish',async()=>{
 await assert.rejects(()=>naverDelivery({}, {kind:'delete'},{}),/DELIVERY_KIND_INVALID/);
});
