'use strict';
window.OpsAuth=(()=>{
 const key='sm_admin_server_session_v1';

 const local=['127.0.0.1','localhost'].includes(location.hostname);let current=null;
 function clear(){current=null;localStorage.removeItem(key);sessionStorage.removeItem(key);}
 function show(message='') {document.getElementById('opsLogin').hidden=false;document.getElementById('opsWorkspace').hidden=true;document.getElementById('opsLoginError').textContent=message;}
 function reveal(){document.getElementById('opsLogin').hidden=true;document.getElementById('opsWorkspace').hidden=false;document.getElementById('opsLogout').hidden=local;}
 async function request(payload){const response=await fetch(await MomentumBackend.url(),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({route:'momentum_admin',...payload}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('로그인 서버 연결을 확인해 주세요.');const value=await response.json();if(!value.ok){const errors={INVALID_LOGIN:'아이디 또는 비밀번호를 확인해 주세요.',LOGIN_RATE_LIMIT:'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.',UNAUTHORIZED:'로그인이 만료되었습니다.'};throw Error(errors[value.error]||'관리자 인증을 확인하지 못했습니다.');}return value.result;}
 function session(){if(local)return null;if(!current||current.expiresAt<=Date.now()){show();return null;}return current.token;}
 function invalid(){clear();show('로그인이 만료되었습니다. 다시 로그인해 주세요.');window.dispatchEvent(new Event('ops-cleared'));}
 async function logout(){const previous=current;clear();show();window.dispatchEvent(new Event('ops-cleared'));try{if(previous)await request({action:'logout',session:previous.token});}catch(_){document.getElementById('opsLoginError').textContent='이 기기에서 로그아웃했습니다. 서버 세션 해제는 연결 복구 후 확인이 필요합니다.';}}
 document.getElementById('opsLoginForm').addEventListener('submit',async event=>{event.preventDefault();const button=document.getElementById('opsLoginButton');if(button.disabled)return;button.disabled=true;button.textContent='인증 중…';const password=document.getElementById('opsPassword');try{const remember=document.getElementById('opsRemember').checked;const value=await request({action:'login',username:document.getElementById('opsUsername').value.trim(),password:password.value,remember});clear();current=value;(remember?localStorage:sessionStorage).setItem(key,JSON.stringify(value));reveal();window.dispatchEvent(new Event('ops-authenticated'));}catch(error){show(error.message);}finally{password.value='';button.disabled=false;button.textContent='운영실 로그인';}});
 document.getElementById('opsLogout').addEventListener('click',logout);
 try{current=JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||'null');}catch(_){clear();}
 if(local||session())reveal();else show();
 async function call(action,payload={}){if(!current||current.expiresAt<=Date.now()){invalid();const e=Error('관리자 로그인이 필요합니다.');e.code='UNAUTHORIZED';throw e;}try{return await request({action,...payload,session:current.token});}catch(error){if(error.message==='로그인이 만료되었습니다.')invalid();throw error;}}
 async function cacheScope(){if(!current)return null;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(current.token));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
 return {session,invalid,local,call,cacheScope,logout,hasAdminSession:()=>!!current&&current.expiresAt>Date.now(),adminToken:()=>current?.token};
})();
