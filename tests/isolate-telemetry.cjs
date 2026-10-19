/* Never let a browser test target production telemetry, even during teardown.
   Reserved .invalid hosts remain unreachable if Playwright routing is already gone. */
module.exports=async function isolateTelemetry(context){
 await context.addInitScript(()=>{
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,options)=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   if(url.hostname==='ntfy.sh')url.hostname='ntfy.telemetry.invalid';
   if(url.hostname==='script.google.com')url.hostname='gas.telemetry.invalid';
   return nativeFetch(url.href,options);
  };
  Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>false});
 });
};
