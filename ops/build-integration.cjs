/* Generate a scoped, native workspace from the existing administrator implementation. */
const fs=require('node:fs');
const postcss=require('postcss');
const source=fs.readFileSync('admin.html','utf8');
const scope='#momentumManagement';
const styles=[...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+fs.readFileSync('assets/admin-workspace.css','utf8')+'\n'+fs.readFileSync('assets/admin-content.css','utf8');
const css=postcss.parse(styles);
css.walkRules(rule=>{
 let parent=rule.parent;while(parent){if(parent.type==='atrule'&&/keyframes$/.test(parent.name))return;parent=parent.parent;}
 rule.selectors=rule.selectors.map(selector=>{
  const trimmed=selector.trim();
  if(/^(?:html|body|:root)$/.test(trimmed))return scope;
  if(trimmed==='html body')return scope;
  return scope+' '+trimmed.replace(/^(?:html|body|:root)\s+/,'');
 });
});
fs.writeFileSync('assets/ops-momentum.css',css.toString());
const start=source.indexOf('  <div id="dashboardApp">');
const finish=source.indexOf('  <script>\n    /* ===================================================',start);
let markup=source.slice(start,finish);
markup=markup.replace(/    <a href="ops.html"[\s\S]*?<\/a>/,'');
markup=markup.replace(/    <header class="top-header">[\s\S]*?<\/header>/,'');
markup=markup.replace('<nav class="workspace-tabs"','<nav hidden class="workspace-tabs"');
const dialog=source.match(/  <dialog id="targetDetail">[\s\S]*?<\/dialog>/)[0];
fs.writeFileSync('ops/momentum-workspace.html',markup+dialog);
let controller=source.slice(finish).match(/<script>([\s\S]*?)<\/script>/)[1];
controller=controller.replace('document.getElementById("loginOverlay").style.display = "none";','');
controller=controller.replace('let dashboardStarted = false;','let dashboardStarted = false;\n    let dashboardPoll = null;');
controller=controller.replace('setInterval(() => {\n        loadTargets()', 'dashboardPoll = setInterval(() => {\n        if(!OpsAuth.hasAdminSession())return;\n        loadTargets()');
controller=controller.replace("const searchStats = targetsMap['_search_db_stats'] || {};", "const searchStats = window.MomentumSearchProgress?.stats() || {};");
controller=controller.replace(/async function loadSystemConfig\(\) \{[\s\S]*?\n    function updateSystemControlUI/, `async function loadSystemConfig() {
      try { systemConfig=await MomentumAdmin.call('settings.status'); updateSystemControlUI(); }
      catch (_) { document.getElementById('textEmailSystem').textContent='자동발송: 상태 확인 불가'; }
    }

    function updateSystemControlUI`);
controller=controller.replace('const res = await fetch("targets.json?v=" + Date.now());', "const value=await ProjectControls.request('targets'); const res={ok:true,json:async()=>value};");
controller=controller.replace('const res = await fetch("backup_status.json?v=" + Date.now());', "const value=await ProjectControls.request('backup-status'); const res={ok:true,json:async()=>({status:value.error?'ERROR':'OK',last_error:value.error,last_backup_time:value.lastSuccessAt})};");
controller=controller.replace('홈페이지 배포 반영 시간이 필요합니다.','우분투 설정이 고객 화면에 반영됩니다.').replace('홈페이지 배포가 반영된 뒤 적용됩니다.','고객 화면에서 다음 설정 조회 시 적용됩니다.');
controller=controller.replace(/updateRepositoryConfig/g,'updateOperationalConfig').replace(/targets\.json 로드 실패/g,'우분투 타깃 DB 조회 실패').replace('1. targets.json, 시스템 제어 config 및 백업 상태 확인','1. 우분투 타깃 DB, 운영 설정 및 Drive 백업 상태 확인');
fs.writeFileSync('assets/ops-momentum-controller.js',controller);
