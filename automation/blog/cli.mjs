import {chromium} from 'playwright';
import {openBrowser, platformInfo, inspectPage, root} from './browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const [command, platform] = process.argv.slice(2);
let context;
async function close() { if (context) await context.close().catch(() => {}); }
process.once('SIGINT', () => close().finally(() => process.exit(130)));
process.once('SIGTERM', () => close().finally(() => process.exit(143)));
try {
  if (command === 'doctor') {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'momentum-chrome-check-'));
    try {
      context = await chromium.launchPersistentContext(temp, {channel:'chrome', headless:true});
      const page = context.pages()[0] || await context.newPage();
      await page.setContent('<title>Momentum Chrome check</title><p>background ready</p>');
      const chrome = await page.evaluate(() => navigator.userAgent);
      const codex = spawnSync('codex', ['login', 'status'], {encoding:'utf8', timeout:15000});
      const auth = (codex.stdout || '') + (codex.stderr || '');
      console.log(JSON.stringify({chromeHeadless: chrome.includes('HeadlessChrome'), pageRendered: await page.title() === 'Momentum Chrome check', codexChatGPTLogin: codex.status === 0 && /using ChatGPT/.test(auth), generationTested:false, profileRoot:root}, null, 2));
    } finally { await close(); await fs.rm(temp,{recursive:true,force:true}); }
  } else if (command === 'setup') {
    const info = platformInfo(platform);
    context = await openBrowser(platform, 'setup');
    const page = context.pages()[0] || await context.newPage();
    await page.goto(info.setup,{waitUntil:'domcontentloaded',timeout:45000});
    console.log('설정용 Chrome이 열렸습니다. 계정 개설·로그인·블로그 설정을 완료한 뒤 이 전용 창을 닫으세요. 개인 Chrome은 유지됩니다.');
    await new Promise(resolve => context.once('close', resolve));
  } else if (command === 'probe') {
    const info = platformInfo(platform);
    context = await openBrowser(platform);
    try {
      const page = context.pages()[0] || await context.newPage();
      const response = await page.goto(info.home,{waitUntil:'domcontentloaded',timeout:45000});
      console.log(JSON.stringify({platform, mode:'headless', httpStatus:response?.status(), ...await inspectPage(page)},null,2));
    } finally { await close(); }
  } else {
    console.log('사용법: node cli.mjs doctor | setup <naver|tistory|threads> | probe <naver|tistory|threads>');
    if(command) process.exitCode = 1;
  }
} catch (error) {
  await close();
  // Browser exception text can contain private profile and target information.
  console.error(error.name === 'TimeoutError' ? '접속 시간 초과. 네트워크 또는 사용자 인증을 확인하세요.' : '실행 실패. Chrome 설치·네트워크·동일 매체 설정 창 실행 여부를 확인하세요.');
  process.exitCode = 1;
}
