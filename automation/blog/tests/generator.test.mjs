import test from 'node:test';import assert from 'node:assert/strict';
import {validateOutputs,makePrompt,schemaFor,loadPromptReferences} from '../generator.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,cpSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
function sources(t){
 const skillDir=mkdtempSync(path.join(os.tmpdir(),'blog-prompt-test-'));
 t.after(()=>rmSync(skillDir,{recursive:true,force:true}));
 mkdirSync(path.join(skillDir,'references'));
 writeFileSync(path.join(skillDir,'SKILL.md'),'[현행 생성 프롬프트](references/codex-generation-G15.md)');
 writeFileSync(path.join(skillDir,'references/generation-ledger.md'),'현재 사용 세대: [G15](codex-generation-G15.md). 상태: active.');
 writeFileSync(path.join(skillDir,'references/codex-generation-G15.md'),'# G15\nPROMPT_GENERATION = G15\n\n앞말을 들었기 때문에 다음 말이 필요한 흐름을 만든다.');
 const promptDir=path.join(skillDir,'prompts');cpSync(new URL('../prompts/',import.meta.url),promptDir,{recursive:true});
 return {skillDir,promptDir};
}
test('generation requires all platforms, blog links and link-free Threads',()=>{
 const value=Object.fromEntries(['naver','tistory','threads'].map(p=>[p,{title:p,body:p==='threads'?'카메라 사기 전에 폰으로 한번 찍어봐.':'https://studiomomentum.github.io/'}]));
 assert.equal(validateOutputs(value),value);
 value.threads.body='확인해 https://studiomomentum.github.io/';assert.throws(()=>validateOutputs(value),/THREADS_LINK_NOT_ALLOWED/);value.threads.body='폰으로 한번 찍어봐.';
 delete value.naver;assert.throws(()=>validateOutputs(value),/OUTPUT_INVALID/);
 value.naver={title:'제목',body:'https://studiomomentum.github.io/?vip'};assert.throws(()=>validateOutputs(value),/OUTBOUND_LINK/);
 value.naver.body='링크 없음';assert.throws(()=>validateOutputs(value),/LINK_MISSING/);
});
test('prompt preserves topic evidence as data and forbids invented outcomes',t=>{
 const prompt=makePrompt({title:'제목',question:'질문',intent:'해결 탐색',evidence:'미검증 가설'},undefined,sources(t));
 assert(prompt.includes('미검증 가설'));assert(prompt.includes('조회수·문의·매출 보장 금지'));assert(prompt.includes('실명은 쓰지 않는다'));
});
test('single platform generation rejects extra outputs and retains platform rules',context=>{
 assert.deepEqual(schemaFor(['tistory']).required,['tistory']);assert.deepEqual(Object.keys(schemaFor(['tistory']).properties),['tistory']);
 const t={tistory:{title:'제목',body:'https://studiomomentum.github.io/'}};
 assert.equal(validateOutputs(t,['tistory']),t);
 assert.throws(()=>validateOutputs({...t,threads:{title:'다른 글',body:'본문'}},['tistory']),/OUTPUT_INVALID/);
 assert.throws(()=>validateOutputs(t,['youtube']),/PLATFORMS_INVALID/);
 assert.throws(()=>validateOutputs({threads:{title:'제목',body:'https://example.com'}},['threads']),/THREADS_LINK_NOT_ALLOWED/);
 assert(makePrompt({title:'주제'},['tistory'],sources(context)).includes('이번 생성 대상: tistory.'));
});
test('generation reads the exact active PD source and reflects MD changes on the next call',t=>{
 const options=sources(t),source=path.join(options.skillDir,'references/codex-generation-G15.md');
 const refs=loadPromptReferences(['naver'],options),text=readFileSync(source,'utf8');
 assert.equal(refs.pd.generation,'G15');assert.equal(refs.pd.text,text);
 assert.equal(refs.pd.sha256,createHash('sha256').update(text).digest('hex'));
 assert(makePrompt({title:'주제'},['naver'],options).includes(text));
 writeFileSync(source,text+'\n수정된 공통 설명 원칙');
 writeFileSync(path.join(options.promptDir,'business-context.md'),'수정된 사업 맥락');
 const next=makePrompt({title:'주제'},['naver'],options);
 assert(next.includes('수정된 공통 설명 원칙'));assert(next.includes('수정된 사업 맥락'));
 assert(!next.includes('# 쓰레드 전용 작성 지침'));
});
test('missing or inconsistent PD source fails instead of silently falling back',t=>{
 const options=sources(t),ledger=path.join(options.skillDir,'references/generation-ledger.md');
 writeFileSync(ledger,'현재 사용 세대: [G16](codex-generation-G16.md)');
 assert.throws(()=>makePrompt({},['naver'],options),/PD_PROMPT_GENERATION_MISMATCH/);
 writeFileSync(ledger,'현재 사용 세대: [G15](codex-generation-G15.md)');
 const source=path.join(options.skillDir,'references/codex-generation-G15.md');
 writeFileSync(source,'PROMPT_GENERATION = G14');
 assert.throws(()=>makePrompt({},['tistory'],options),/PD_PROMPT_GENERATION_MISMATCH/);
 rmSync(source);assert.throws(()=>makePrompt({},['naver'],options),/PROMPT_SOURCE_UNAVAILABLE/);
});
test('Threads-only generation uses its existing rules without requiring the PD skill or blog adapter',t=>{
 const options=sources(t);rmSync(path.join(options.skillDir,'SKILL.md'));
 rmSync(path.join(options.promptDir,'blog-adapter.md'));
 const prompt=makePrompt({title:'주제'},['threads'],options);
 assert(prompt.includes('500자 이내'));assert(prompt.includes('자연스러운 반말'));
 assert(!prompt.includes('PD 글쓰기 기반 원문'));assert(!prompt.includes('1,200자'));
});
test('the active skill and ledger links select a newer generation without editing generator code',t=>{
 const options=sources(t);
 writeFileSync(path.join(options.skillDir,'SKILL.md'),'[현행 생성 프롬프트](references/codex-generation-G16.md)');
 writeFileSync(path.join(options.skillDir,'references/generation-ledger.md'),'현재 사용 세대: [G16](codex-generation-G16.md). 상태: active.');
 writeFileSync(path.join(options.skillDir,'references/codex-generation-G16.md'),'PROMPT_GENERATION = G16\n새 세대 테스트 원문');
 assert.equal(loadPromptReferences(['naver'],options).pd.generation,'G16');
});
test('installed runtime resolves original Markdown through its private configuration',async t=>{
 const options=sources(t),runtime=path.join(options.skillDir,'runtime');mkdirSync(runtime);
 cpSync(new URL('../generator.mjs',import.meta.url),path.join(runtime,'generator.mjs'));
 writeFileSync(path.join(runtime,'prompt-sources.json'),JSON.stringify(options));
 const installed=await import(pathToFileURL(path.join(runtime,'generator.mjs')));
 assert.equal(installed.loadPromptReferences(['naver']).pd.generation,'G15');
 writeFileSync(path.join(options.promptDir,'business-context.md'),'원본 MD 변경 반영');
 assert(installed.makePrompt({},['naver']).includes('원본 MD 변경 반영'));
 writeFileSync(path.join(runtime,'prompt-sources.json'),'{broken');
 assert.throws(()=>installed.makePrompt({},['naver']),/PROMPT_CONFIG_INVALID/);
});
function modernSources(t){
 const options=sources(t),dir=path.join(options.skillDir,'references/script-generation');mkdirSync(dir);
 writeFileSync(path.join(options.skillDir,'SKILL.md'),'[G17](references/script-generation/codex-generation-G17.md)\n[G17](references/script-generation/codex-generation-G17.md)');
 writeFileSync(path.join(options.skillDir,'references/generation-ledger.md'),'# 원장\n\n## 현행 실행 범위 — 범용 G17\n\n[G17](script-generation/codex-generation-G17.md) 전문을 단독 적용한다.\n\n## 이전 실행 범위\n[G16](script-generation/codex-generation-G16.md)\n');
 writeFileSync(path.join(dir,'codex-generation-G17.md'),'PROMPT_GENERATION = G17\n현행 원문');
 return options;
}
test('current ledger section selects nested G17 source and ignores historical generations',t=>{
 const options=modernSources(t),refs=loadPromptReferences(['naver'],options);
 assert.equal(refs.pd.generation,'G17');assert(refs.pd.sourcePath.endsWith('references/script-generation/codex-generation-G17.md'));
 const source=refs.pd.sourcePath;writeFileSync(source,'PROMPT_GENERATION = G17\n현행 원문 수정');
 assert(makePrompt({},['tistory'],options).includes('현행 원문 수정'));
});
test('modern source must agree with skill and original generation marker',t=>{
 const options=modernSources(t),skill=path.join(options.skillDir,'SKILL.md');
 writeFileSync(skill,'[G16](references/script-generation/codex-generation-G16.md)');
 assert.throws(()=>loadPromptReferences(['naver'],options),/PD_PROMPT_GENERATION_MISMATCH/);
 writeFileSync(skill,'[G17](references/script-generation/codex-generation-G17.md)');
 writeFileSync(path.join(options.skillDir,'references/script-generation/codex-generation-G17.md'),'PROMPT_GENERATION = G16');
 assert.throws(()=>loadPromptReferences(['tistory'],options),/PD_PROMPT_GENERATION_MISMATCH/);
});
test('ambiguous or missing current source fails without falling back to historical G15',t=>{
 const options=modernSources(t),ledger=path.join(options.skillDir,'references/generation-ledger.md');
 writeFileSync(ledger,'## 현행 실행 범위\n[G17](script-generation/codex-generation-G17.md)\n[G16](script-generation/codex-generation-G16.md)');
 assert.throws(()=>loadPromptReferences(['naver'],options),/PD_PROMPT_REFERENCE_INVALID/);
 writeFileSync(ledger,'## 현행 실행 범위\n현행 링크 없음\n## 이전 실행 범위\n[G15](codex-generation-G15.md)');
 assert.throws(()=>loadPromptReferences(['naver'],options),/PD_PROMPT_REFERENCE_INVALID/);
 writeFileSync(ledger,'## 현행 실행 범위\n[G17](script-generation/codex-generation-G17.md)\n## 현행 실행 범위\n[G17](script-generation/codex-generation-G17.md)');
 assert.throws(()=>loadPromptReferences(['naver'],options),/PD_PROMPT_REFERENCE_INVALID/);
});

test('Antigravity envelope requires success and preserves platform validation',async()=>{
 const {parseAntigravityResponse}=await import('../generator.mjs');
 const value={threads:{title:'제목',body:'카메라보다 질문부터 정해봐'}};
 assert.deepEqual(parseAntigravityResponse(JSON.stringify({status:'SUCCESS',response:JSON.stringify(value)}),['threads']),value);
 assert.throws(()=>parseAntigravityResponse(JSON.stringify({status:'ERROR',response:JSON.stringify(value)}),['threads']),/GENERATION_FAILED/);
 assert.throws(()=>parseAntigravityResponse(JSON.stringify({status:'SUCCESS',response:JSON.stringify({threads:{title:'제목',body:'https://example.com'}})}),['threads']),/THREADS_LINK_NOT_ALLOWED/);
});

test('scheduled writing context applies G17 principles to Threads without removing its platform rules',t=>{
 const options={...sources(t),writingContext:'조회수 우선. 전문직 전담촬영. 주제 제한 없음.'};
 const prompt=makePrompt({title:'전문직 영상의 첫인상'},['naver','threads'],options);
 assert(prompt.includes('전문직 전담촬영'));assert(prompt.includes('예약 작업의 쓰레드는 G17'));
 assert(prompt.includes('500자 이내'));assert(prompt.includes('링크 제외'));
 assert.throws(()=>validateOutputs({threads:{title:'제목',body:'가'.repeat(501)}},['threads']),/THREADS_TOO_LONG/);
});
