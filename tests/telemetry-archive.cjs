const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context={window:{},document:{addEventListener(){}}};vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/momentum-runtime.js','utf8'),context);
const M=context.window.Momentum;
const stored={event:'email_open',ref:'a',time:'2026-09-25T00:00:00Z'};
const device={event:'email_open',ref:'a',timestamp:Date.parse(stored.time),_msg_id:'original-message'};
assert.equal(M.unpersistedEvents([device],[stored]).length,0);
const missing={event:'email_open',ref:'b',timestamp:Date.parse(stored.time)+1000,_msg_id:'missing-message'};
const local=[device,missing,{event:'email_open',ref:'test',timestamp:1}];
const pending=M.unpersistedEvents(local,[stored]);assert.equal(pending.length,1);assert.equal(pending[0].ref,'b');
assert.equal(M.unpersistedEvents(local,[stored,...pending]).length,0);
assert.equal(M.unpersistedEvents(local,[stored]).length,1); // Failure leaves retry intact.
const targets={a:{token:'a',status:'SENT'},b:{token:'b',status:'SENT'}};
assert.equal(M.activitySets(targets,[stored],true).openedTokens.size,1);
assert.equal(M.activitySets(targets,[stored,...pending,missing],true).openedTokens.size,2);
console.log('PASS: duplicate identities, local recovery, repeat sync, failure preservation, unique recipient count');
