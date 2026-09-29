import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {inspectPage, platformInfo} from '../browser.mjs';

test('unknown platforms cannot select a profile or destination', () => {
  for (const name of ['../Default','__proto__','constructor']) assert.throws(() => platformInfo(name));
});
test('visible setup and headless operation preserve session; auth barriers stay unverified', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'momentum-mode-test-'));
  const server = http.createServer((req,res) => res.end('<html><body>Session fixture</body></html>'));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launchPersistentContext(folder,{channel:'chrome',headless:false});
    let page = browser.pages()[0];
    await page.goto(url);
    await page.evaluate(() => {localStorage.setItem('setupComplete','yes');document.cookie='fixture_session=preserved; Max-Age=3600; SameSite=Lax';});
    assert.equal((await page.evaluate(() => navigator.userAgent)).includes('HeadlessChrome'),false);
    await browser.close();
    browser = await chromium.launchPersistentContext(folder,{channel:'chrome',headless:true});
    page = browser.pages()[0];
    await page.goto(url);
    assert.equal((await page.evaluate(() => navigator.userAgent)).includes('HeadlessChrome'),true);
    assert.equal(await page.evaluate(() => localStorage.getItem('setupComplete')),'yes');
    assert.match(await page.evaluate(() => document.cookie),/fixture_session=preserved/);
    assert.equal((await inspectPage(page)).state,'ACCOUNT_NOT_VERIFIED');
    await page.setContent('<input type=password>');
    assert.equal((await inspectPage(page)).state,'LOGIN_REQUIRED');
    await page.setContent('<p>자동입력 방지</p>');
    assert.equal((await inspectPage(page)).state,'USER_ACTION_REQUIRED');
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(folder,{recursive:true,force:true});
  }
});
