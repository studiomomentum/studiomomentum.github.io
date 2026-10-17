// Retry only read-only result lookups. Never pass a publisher/editor action here.
export async function retryPublishedRead(read,{attempts=3,delayMs=1000}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  try{return await read();}catch(error){
   if(attempt===attempts-1||['AMBIGUOUS_POST','POST_URL_INVALID','WRONG_ACCOUNT','WRONG_BLOG'].includes(error.message))throw error;
   await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
 }
}
