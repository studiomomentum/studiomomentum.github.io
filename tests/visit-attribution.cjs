const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('assets/momentum-runtime.js','utf8');
async function check(search,referrer,expected){
 let serial=0;const sent=[];const fetch=async(url,init)=>{sent.push(JSON.parse(init.body));return {ok:true};};
 const window={location:{search,hash:'',hostname:'studiomomentum.github.io'},fetch};
 vm.runInNewContext(code,{window,document:{referrer,addEventListener(){}},URL,URLSearchParams,crypto:{randomUUID:()=>String(++serial)},fetch,navigator:{}});
 for(const event of ['visit','kakao_click'])await window.Momentum.sendTelemetry({event,ref:'customer',channel_type:'OUTBOUND',pricing_tier:'OUTBOUND_VIP',meta:{elapsed:3}},'mock');
 assert.equal(sent[0].meta.arrival_source,expected);assert.equal(sent[0].meta.applied_pricing,'OUTBOUND_VIP');assert.equal(sent[0].ref,'customer');assert.equal(sent[0].meta.visit_id,sent[1].meta.visit_id);assert.equal(sent[1].meta.elapsed,3);
 return sent[0];
}
(async()=>{
 assert.equal((await check('', 'https://www.google.com/search?q=x','검색: www.google.com')).meta.attribution_basis,'이전 제안 방문 이력');
 await check('','', '직접 / 출처 미확인');
 assert.equal((await check('?ref=customer','','제안 전용 링크')).meta.attribution_basis,'전용 링크');
 await check('?utm_source=newsletter&utm_medium=email','','캠페인: newsletter');
 await check('','https://google.com.evil.test/','외부 링크: google.com.evil.test');
 console.log('PASS: current arrival independent of VIP attribution, page event association, metadata preservation');
})().catch(e=>{console.error(e);process.exit(1)});
