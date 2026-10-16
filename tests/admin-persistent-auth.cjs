const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync('assets/admin-auth.js','utf8'),key='sm_admin_server_session_v1';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
function browser(local=storage(),temporary=storage()){
 let now=Date.now(),calls=[];
 const nodes=new Map();const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{},textContent:''});return nodes.get(id);}};
 const ctx={window:{dispatchEvent(){}},document,localStorage:local,sessionStorage:temporary,Event:class{},TextEncoder,crypto:crypto.webcrypto,AbortSignal,Number,Date:{now:()=>now},GAS_DB_URL:'https://relay.example.test',initDashboard:async()=>{},location:{reload(){}},fetch:async(url,opts)=>{
  const r=JSON.parse(opts.body);calls.push(r);
  const result=r.action==='login'?{token:'fixture-session',persistent:r.remember===true,expiresAt:r.remember===true?null:now+8*60*60*1000}:r.action==='session'?{persistent:r.remember===true,expiresAt:r.remember===true?null:now+8*60*60*1000}:{};
  return {ok:true,json:async()=>({ok:true,result})};
 }};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {auth:ctx.window.MomentumAdmin,local,temporary,calls,advance:ms=>now+=ms};
}
(async()=>{
 const a=browser();await a.auth.login('admin','fixture-password',true);
 assert.equal(JSON.parse(a.local.getItem(key)).persistent,true);assert.equal(a.temporary.getItem(key),null);
 a.advance(20*365*24*60*60*1000);await a.auth.call('content.get');assert(await a.auth.cacheScope());
 const reopened=browser(a.local);await reopened.auth.restore();assert.equal(reopened.calls[0].remember,true);
 const legacy=storage();legacy.setItem(key,JSON.stringify({token:'legacy',expiresAt:Date.now()+3600000}));
 const migrated=browser(legacy);await migrated.auth.restore();assert.equal(JSON.parse(legacy.getItem(key)).persistent,true);
 const b=browser();await b.auth.login('admin','fixture-password',false);assert.equal(b.local.getItem(key),null);
 b.advance(9*60*60*1000);await assert.rejects(()=>b.auth.call('content.get'),e=>e.code==='UNAUTHORIZED');
 assert.equal(b.temporary.getItem(key),null);
 await reopened.auth.logout();assert.equal(reopened.local.getItem(key),null);
 console.log('PASS persistent browser login, 20-year elapsed time, reopen, migration, temporary expiry, cache scope and logout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
