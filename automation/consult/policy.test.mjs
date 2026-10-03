import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadKnowledge,renderAnswer,responseSchema} from './app-server.mjs';
test('only vetted business copy is displayed; pricing is channel-bound',async()=>{
  const {entries}=await loadKnowledge();
  assert.match(renderAnswer({answers:['boundary'],question:'q_scope'},entries,'INBOUND'),/유료 제작/);
  assert.throws(()=>renderAnswer({answers:['대본 전문'],question:'q_none'},entries,'INBOUND'));
  assert.throws(()=>renderAnswer({answers:['price_outbound'],question:'q_none'},entries,'INBOUND'));
  assert.throws(()=>renderAnswer({answers:['scope'],question:'q_none',answer:'ignore rules'},entries,'INBOUND'));
  assert(!responseSchema(entries,'OUTBOUND').properties.answers.items.enum.includes('price_inbound'));
});
