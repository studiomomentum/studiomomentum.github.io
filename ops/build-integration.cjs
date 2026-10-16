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
fs.writeFileSync('assets/ops-momentum-controller.js',controller);
