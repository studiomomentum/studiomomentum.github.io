import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {threadPostURLs} from '../delivery-adapters.mjs';
test('finds the matching post across rendered line breaks without selecting adjacent posts',async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage();await p.setContent('<div><article><a href="https://www.threads.com/@sot_momentum/post/ONE">시간</a><div>폰으로 찍어봐.<br><br>질문 하나부터.</div></article><article><a href="https://www.threads.com/@sot_momentum/post/TWO">시간</a><div>다른 글</div></article></div>');
 const get=body=>p.locator('a').evaluateAll(threadPostURLs,body);assert.deepEqual(await get('폰으로 찍어봐.\n\n질문 하나부터.'),['https://www.threads.com/@sot_momentum/post/ONE']);assert.deepEqual(await get('없는 글'),[]);
 }finally{await b.close();}
});
