import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// No option accepts an existing personal Chrome profile.
export const root = path.join(os.homedir(), 'Library', 'Application Support', 'MomentumBlog');
export const platforms = {
  naver: {setup: 'https://nid.naver.com/nidlogin.login', home: 'https://blog.naver.com/'},
  tistory: {setup: 'https://www.tistory.com/auth/login', home: 'https://www.tistory.com/'},
  threads: {setup: 'https://www.threads.com/', home: 'https://www.threads.com/'},
};
export function platformInfo(name) {
  if (!Object.hasOwn(platforms, name)) throw new Error('지원 매체: naver, tistory, threads');
  return platforms[name];
}
export async function openBrowser(platform, mode = 'operate') {
  platformInfo(platform);
  if (!['setup', 'operate'].includes(mode)) throw new Error('잘못된 실행 모드');
  const profile = path.join(root, 'profiles', platform);
  await fs.mkdir(profile, {recursive: true, mode: 0o700});
  await fs.chmod(root, 0o700);
  await fs.chmod(profile, 0o700);
  // Chrome's native profile lock prevents simultaneous setup/operation.
  // Never remove SingletonLock or kill another browser to recover a conflict.
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: mode === 'operate',
    viewport: mode === 'setup' ? null : {width: 1440, height: 1000},
    acceptDownloads: false, timeout: 30000,
  });
  if (mode === 'setup') {
    // A listener leaves native dialogs open for the user instead of Playwright
    // automatically dismissing them. Never auto-accept creation or deletion.
    const preserveDialogs = page => page.on('dialog', () => {});
    context.pages().forEach(preserveDialogs);
    context.on('page', preserveDialogs);
  }
  return context;
}
export async function inspectPage(page) {
  const url = new URL(page.url());
  const text = (await page.locator('body').innerText()).slice(0, 150000);
  const passwordVisible = await page.locator('input[type=password]').first().isVisible().catch(() => false);
  const challengeVisible = await page.locator('iframe[src*="captcha"], input[name*="captcha"], input[id*="captcha"]').first().isVisible().catch(() => false);
  const challenge = challengeVisible || /자동입력 방지|비정상적인 접근|보안 확인을 완료|verify you are human/i.test(text);
  return {
    // Do not log full URLs, DOM, cookies, or login form contents.
    host: url.hostname,
    state: challenge ? 'USER_ACTION_REQUIRED' : passwordVisible || /nid\.naver\.com|accounts\.kakao\.com/.test(url.hostname) ? 'LOGIN_REQUIRED' : 'ACCOUNT_NOT_VERIFIED',
    publishingVerified: false,
  };
}
