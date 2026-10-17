import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {root} from './browser.mjs';
import {loadPromptReferences} from './generator.mjs';
const label='com.momentum.blog-worker',domain='gui/'+process.getuid(),source=path.dirname(fileURLToPath(import.meta.url)),runtime=path.join(root,'runtime');
const plist=path.join(os.homedir(),'Library/LaunchAgents',label+'.plist');
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.status!==0)throw Error('SERVICE_COMMAND_FAILED');};
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
if(process.argv[2]==='stop'){spawnSync('launchctl',['bootout',domain,plist],{stdio:'ignore'});console.log('실행기 자동 시작 해제');}
else{
 // Validate live Markdown sources before stopping the running service.
 const promptDir=path.join(source,'prompts'),skillDir=path.join(os.homedir(),'Desktop','PD','skills','youtube-production');
 loadPromptReferences(undefined,{promptDir,skillDir});
 // Stop only this registered service before replacing its runtime.
 spawnSync('launchctl',['bootout',domain,plist],{stdio:'ignore'});
 await fs.mkdir(runtime,{recursive:true,mode:0o700});
 for(const name of ['autopilot.mjs','autopilot-cli.mjs','autopilot-policy.mjs','view-metrics.mjs','durable-json.mjs','worker.mjs','keyword-worker.mjs','keyword-refresh.mjs','research-sources.mjs','vidiq-keywords.mjs','vidiq-mcp.mjs','keyword-framing.mjs','browser.mjs','campaign-link.mjs','generator.mjs','delivery-worker.mjs','delivery-adapters.mjs','publication-result.mjs','naver-delivery.mjs','tistory-draft.mjs','draft-format.mjs','package.json','package-lock.json'])await fs.copyFile(path.join(source,name),path.join(runtime,name));
 await fs.writeFile(path.join(runtime,'prompt-sources.json'),JSON.stringify({promptDir,skillDir}),{mode:0o600});
 run('/opt/homebrew/bin/npm',['ci','--omit=dev','--prefix',runtime]);
 await fs.mkdir(path.dirname(plist),{recursive:true});
 const log=path.join(root,'worker.log');
 await fs.writeFile(log,'',{flag:'a',mode:0o600});
 await fs.writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
 <key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml("/opt/homebrew/bin/node")}</string><string>${xml(path.join(runtime,'worker.mjs'))}</string><string>run</string></array>
 <key>WorkingDirectory</key><string>${xml(runtime)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>60</integer>
 <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
 <key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string>
 </dict></plist>`,{mode:0o600});
 run('launchctl',['bootstrap',domain,plist]);console.log('PC 로그인 시 실행기 자동 시작 등록 완료');
}
