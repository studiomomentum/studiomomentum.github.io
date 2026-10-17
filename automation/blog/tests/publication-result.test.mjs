import test from 'node:test';import assert from 'node:assert/strict';
import {retryPublishedRead} from '../publication-result.mjs';

test('result lookup recovers delayed visibility without repeating the publish action',async()=>{
 let clicks=0,reads=0;
 const publish=async()=>{clicks++;};await publish();
 const result=await retryPublishedRead(async()=>{if(++reads<3)throw Error('RESULT_NOT_VERIFIED');return {url:'confirmed'};},{delayMs:0});
 assert.deepEqual(result,{url:'confirmed'});assert.equal(reads,3);assert.equal(clicks,1);
});
test('ambiguous results stop immediately and absent posts remain unverified',async()=>{
 let reads=0;
 await assert.rejects(()=>retryPublishedRead(async()=>{reads++;throw Error('AMBIGUOUS_POST');},{delayMs:0}),/AMBIGUOUS_POST/);assert.equal(reads,1);
 reads=0;await assert.rejects(()=>retryPublishedRead(async()=>{reads++;throw Error('RESULT_NOT_VERIFIED');},{delayMs:0}),/RESULT_NOT_VERIFIED/);assert.equal(reads,3);
});
