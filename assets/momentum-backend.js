/* Public endpoint discovery only. Credentials remain in the existing login flow. */
window.MomentumBackend=(()=>{
 let current=null,until=0,pending=null;
 async function url(){
  if(['127.0.0.1','localhost'].includes(location.hostname))return 'http://127.0.0.1:8797/api/momentum';
  if(current&&Date.now()<until)return current;
  if(!pending)pending=(async()=>{
   const response=await fetch(new URL('/ops-config.json?v='+Date.now(),location.origin),{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('UBUNTU_ENDPOINT_UNAVAILABLE');const config=await response.json(),base=new URL(config.apiBase);
   if(base.protocol!=='https:'||!base.hostname.endsWith('.trycloudflare.com')||base.username||base.password||base.port)throw Error('UBUNTU_ENDPOINT_INVALID');
   current=base.origin+'/api/momentum';until=Date.now()+30000;return current;
  })().finally(()=>{pending=null;});
  return pending;
 }
 async function request(body){try{const response=await fetch(await url(),{method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('UBUNTU_CONNECTION_FAILED');return await response.json();}catch(e){current=null;until=0;throw e;}}
 return {url,request};
})();
