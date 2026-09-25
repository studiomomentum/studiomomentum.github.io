/* Server session only. No GitHub token or password hash is shipped to this page. */
window.MomentumAdmin = (() => {
  const key='sm_admin_server_session_v1';
  let session=null;
  const messages={UNAUTHORIZED:'로그인이 만료되었습니다. 다시 로그인해 주세요.',INVALID_LOGIN:'아이디 또는 비밀번호가 일치하지 않습니다.',LOGIN_RATE_LIMIT:'로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.',SERVER_NOT_CONFIGURED:'서버 인증 설정을 확인해야 합니다.',SYSTEM_PAUSED:'전체 자동화가 정지되어 분류를 실행하지 않았습니다.',BUSY:'다른 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.',GITHUB_CONNECTION:'서버에서 GitHub 연결을 확인하지 못했습니다.'};
  function clear(){session=null;localStorage.removeItem(key);sessionStorage.removeItem(key);localStorage.removeItem('sm_admin_persistent_auth');sessionStorage.removeItem('sm_admin_authenticated');}
  function loginScreen(message=''){
    document.getElementById('dashboardApp').style.display='none';document.getElementById('loginOverlay').style.display='flex';
    const error=document.getElementById('loginError');error.textContent=message;error.style.display=message?'block':'none';
  }
  async function request(action,payload={}){
    let response,data;
    try{
      response=await fetch(GAS_DB_URL,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({route:'momentum_admin',action,...payload}),signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('NETWORK');
      data=await response.json();
    }catch(_){const e=new Error('서버 연결을 확인하지 못했습니다. 잠시 후 상태를 확인해 주세요.');e.code='NETWORK';throw e;}
    if(!data.ok){const code=data.error||'SERVER_ERROR';const e=new Error(messages[code]||'서버 요청 실패 ('+code+')');e.code=code;throw e;}
    return data.result;
  }
  async function call(action,payload={}){
    if(!session||session.expiresAt<=Date.now()){clear();loginScreen(messages.UNAUTHORIZED);const e=new Error(messages.UNAUTHORIZED);e.code='UNAUTHORIZED';throw e;}
    try{return await request(action,{...payload,session:session.token});}
    catch(e){if(e.code==='UNAUTHORIZED'){clear();loginScreen(e.message);}throw e;}
  }
  async function login(username,password,remember){
    clear();const result=await request('login',{username,password,remember});session=result;
    (remember?localStorage:sessionStorage).setItem(key,JSON.stringify(session));
    document.getElementById('loginError').style.display='none';
    await initDashboard();document.getElementById('loginOverlay').style.display='none';document.getElementById('dashboardApp').style.display='block';
  }
  async function restore(){
    localStorage.removeItem('sm_admin_persistent_auth');sessionStorage.removeItem('sm_admin_authenticated');
    try{session=JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||'null');if(!session)return loginScreen();await call('session');await initDashboard();}
    catch(e){if(e.code!=='NETWORK')clear();loginScreen(e.message);}
  }
  async function logout(){
    try{if(session)await call('logout');}finally{clear();location.reload();}
  }
  return {call,login,restore,logout,loginScreen};
})();
async function handleLogin(event){
  event.preventDefault();const button=document.querySelector('#loginForm button[type="submit"]');if(button.disabled)return;
  button.disabled=true;button.textContent='서버 인증 중…';
  const input=document.getElementById('password');
  try{await MomentumAdmin.login(document.getElementById('username').value.trim(),input.value,document.getElementById('rememberMe').checked);}
  catch(e){MomentumAdmin.loginScreen(e.message);}
  finally{input.value='';button.disabled=false;button.textContent='대시보드 로그인';}
}
function checkAuth(){return MomentumAdmin.restore();}
function handleLogout(){if(confirm('로그아웃 하시겠습니까?'))MomentumAdmin.logout();}
