import test from 'node:test';import assert from 'node:assert/strict';
import {validateOutputs,makePrompt} from '../generator.mjs';
test('generation requires all platforms and inbound links',()=>{
 const value=Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:p,body:'https://studiomomentum.github.io/'}]));
 assert.equal(validateOutputs(value),value);delete value.naver;assert.throws(()=>validateOutputs(value),/OUTPUT_INVALID/);
 value.naver={title:'제목',body:'https://studiomomentum.github.io/?vip'};assert.throws(()=>validateOutputs(value),/OUTBOUND_LINK/);
 value.naver.body='링크 없음';assert.throws(()=>validateOutputs(value),/LINK_MISSING/);
});
test('prompt preserves topic evidence as data and forbids invented outcomes',()=>{
 const prompt=makePrompt({title:'제목',question:'질문',intent:'해결 탐색',evidence:'미검증 가설'});
 assert(prompt.includes('미검증 가설'));assert(prompt.includes('조회수·문의·매출 보장 금지'));assert(prompt.includes('실명은 쓰지 않는다'));
});
