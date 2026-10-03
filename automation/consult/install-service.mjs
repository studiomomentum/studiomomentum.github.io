import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {root,loadKnowledge} from './app-server.mjs';
const source=path.dirname(fileURLToPath(import.meta.url));
const label='com.momentum.consult-worker',domain='gui/'+process.getuid();
const plist=path.join(os.homedir(),'Library/LaunchAgents',label+'.plist');
const xml=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
await loadKnowledge();await fs.mkdir(root,{recursive:true,mode:0o700});
if(process.argv[2]==='register'){
  const session=JSON.parse(await fs.readFile(path.join(os.homedir(),'Library/Application Support/MomentumBlog/worker-session.json'),'utf8'));
  if(session.expiresAt<=Date.now())throw Error('ADMIN_LOGIN_REQUIRED');
  const r=await fetch(session.url,{method:'POST',body:JSON.stringify({route:'momentum_admin',action:'consult.worker.register',session:session.session}),signal:AbortSignal.timeout(25000)});
  const data=await r.json();if(!data.ok)throw Error(data.error||'REGISTER_FAILED');
  await fs.writeFile(path.join(root,'worker.json'),JSON.stringify({url:session.url,workerToken:data.result.workerToken}),{mode:0o600});
  console.log('상담 전용 실행기 인증 등록 완료');
}else{
  await fs.access(path.join(root,'worker.json'));
  spawnSync('launchctl',['bootout',domain,plist],{stdio:'ignore'});
  const log=path.join(root,'worker.log');await fs.writeFile(log,'',{flag:'a',mode:0o600});
  await fs.writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>/opt/homebrew/bin/node</string><string>${xml(path.join(source,'worker.mjs'))}</string><string>run</string></array>
<key>WorkingDirectory</key><string>${xml(source)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin</string></dict><key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>`,{mode:0o600});
  const r=spawnSync('launchctl',['bootstrap',domain,plist],{stdio:'inherit'});if(r.status!==0)throw Error('SERVICE_FAILED');
  console.log('상담 실행기 자동 시작 등록 완료');
}
