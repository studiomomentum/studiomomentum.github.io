import test from 'node:test';import assert from 'node:assert/strict';
import {validateOutputs,makePrompt} from '../generator.mjs';
test('generation requires all platforms, blog links and link-free Threads',()=>{
 const value=Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:p,body:p==='threads'?'카메라 사기 전에 폰으로 한번 찍어봐.':'https://studiomomentum.github.io/'}]));
 assert.equal(validateOutputs(value),value);
 value.threads.body='확인해 https://studiomomentum.github.io/';assert.throws(()=>validateOutputs(value),/THREADS_LINK_NOT_ALLOWED/);value.threads.body='폰으로 한번 찍어봐.';
 delete value.naver;assert.throws(()=>validateOutputs(value),/OUTPUT_INVALID/);
 value.naver={title:'제목',body:'https://studiomomentum.github.io/?vip'};assert.throws(()=>validateOutputs(value),/OUTBOUND_LINK/);
 value.naver.body='링크 없음';assert.throws(()=>validateOutputs(value),/LINK_MISSING/);
});
test('prompt preserves topic evidence as data and forbids invented outcomes',()=>{
 const prompt=makePrompt({title:'제목',question:'질문',intent:'해결 탐색',evidence:'미검증 가설'});
 assert(prompt.includes('미검증 가설'));assert(prompt.includes('조회수·문의·매출 보장 금지'));assert(prompt.includes('실명은 쓰지 않는다'));
});
