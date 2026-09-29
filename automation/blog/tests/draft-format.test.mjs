import test from 'node:test';import assert from 'node:assert/strict';
import {draftHTML,fingerprint,normalizedText} from '../draft-format.mjs';
test('preserves Korean paragraph and intentional line boundaries, escapes editor HTML',()=>{
 assert.equal(draftHTML('첫 문단\r\n같은 문단\r\n\r\n둘째 <script> & "인용"'),'<p>첫 문단<br>같은 문단</p>\n<p>둘째 &lt;script&gt; &amp; &quot;인용&quot;</p>');
 assert.throws(()=>draftHTML(' '),/EMPTY_DRAFT/);
});
test('receipt fingerprint distinguishes content revisions',()=>{
 const a={title:'제목',body:'첫 문단\n\n둘째 문단'};assert.equal(fingerprint(a),fingerprint({...a}));assert.notEqual(fingerprint(a),fingerprint({...a,body:a.body+' 수정'}));
 assert.equal(normalizedText('문장\u00a0하나\n\n둘'), '문장 하나 둘');
});
