// Import a reviewed research snapshot. This never generates or publishes articles.
import fs from 'node:fs/promises';import path from 'node:path';import {root} from './browser.mjs';
const file=process.argv[2];if(!file)throw Error('KEYWORD_BOARD_FILE_REQUIRED');
const board=JSON.parse(await fs.readFile(file,'utf8'));
const config=JSON.parse(await fs.readFile(path.join(root,'worker-session.json'),'utf8'));
if(config.expiresAt<=Date.now())throw Error('LOGIN_REQUIRED');
if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.url))throw Error('RELAY_URL_INVALID');
const response=await fetch(config.url,{method:'POST',body:JSON.stringify({route:'momentum_admin',action:'content.keywords.save',session:config.session,board}),signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('RELAY_CONNECTION');const data=await response.json();if(!data.ok)throw Error(data.error||'RELAY_FAILED');console.log('키워드 TOP 10 세 목록 저장 완료 · 글 생성/발행 없음');
