import test from 'node:test';import assert from 'node:assert/strict';
import {campaignLink,trackArticleLinks} from '../campaign-link.mjs';
import {validateOutputs} from '../generator.mjs';
test('platform and article tracking preserves blog validation and link-free Threads',()=>{
 const value={naver:{title:'제목',body:'상담 https://studiomomentum.github.io/'},tistory:{title:'제목',body:'[상담](https://studiomomentum.github.io/)'},threads:{title:'제목',body:'촬영 전에 한번 생각해봐'}};
 trackArticleLinks(value,'abc-123');validateOutputs(value);
 for(const p of ['naver','tistory']){assert(value[p].body.includes(campaignLink(p,'topic_abc-123')));assert(!value[p].body.includes('ref='));}
 assert(value.tistory.body.endsWith(')'));assert.equal(value.threads.body,'촬영 전에 한번 생각해봐');
 assert.throws(()=>campaignLink('naver','bad&ref=vip'));
 const once=JSON.stringify(value);trackArticleLinks(value,'abc-123');assert.equal(JSON.stringify(value),once);
});
