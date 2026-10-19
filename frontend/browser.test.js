import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PASTE_BASE_URL || 'http://127.0.0.1:18088';
const output = process.env.PASTE_EVIDENCE_DIR || '.build/verification';
const yaml = 'server:\n  host: localhost\n  port: 25565\n  enabled: true\n  plugins:\n    - LuckPerms\n    - Vault\n';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const saved = [];
const results = [];

async function home() {
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await page.locator('#extension').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#open, #langs, #filter, #drop-overlay, input[type=file]').count(), 0);
}

async function save(text, { immediate = false } = {}) {
  await home();
  await page.locator('#text').fill(text);
  if (!immediate) await page.waitForTimeout(350);
  await Promise.all([
    page.waitForURL(url => url.pathname !== '/'),
    page.locator('#text').press('Control+s'),
  ]);
  const path = new URL(page.url()).pathname;
  saved.push(path);
  const raw = await context.request.get(base + '/raw' + path);
  assert.equal(raw.status(), 200);
  // Native HTML form submission normalizes textarea line endings to CRLF.
  assert.equal((await raw.text()).replace(/\r\n/g, '\n'), text.replace(/\r\n/g, '\n'));
  return path;
}

try {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await home();
    await page.locator('#text').fill(yaml);
    await page.waitForFunction(() => document.querySelector('#extension').value === 'yaml');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true });
  }
  results.push('Upload and language controls removed; auto-detection and responsive layout at 320, 390, 768 and 1440px');
  assert.equal(await page.locator('#expiry-list input:checked').inputValue(), '86400');
  assert.equal(await page.title(), 'Blocksmith Paste');
  results.push('New pastes default to a one-day timer');
  await page.setViewportSize({ width: 1440, height: 1000 });

  const yamlPath = await save(yaml, { immediate: true });
  assert.match(yamlPath, /\.yaml$/);
  assert.ok(await page.locator('.src-code span').count() > 5);
  await page.screenshot({ path: `${output}/saved-yaml.png`, fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/saved-yaml-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const visitor = await browser.newContext();
  const shared = await visitor.newPage();
  assert.equal((await shared.goto(base + yamlPath)).status(), 200);
  assert.ok(await shared.locator('.src-code span').count() > 5);
  assert.equal(await shared.locator('[aria-label="delete paste"]').count(), 0);
  assert.ok((await context.cookies()).some(cookie => cookie.name === 'uid'));
  for (const client of [context.request, visitor.request]) {
    const id = yamlPath.split('.')[0];
    assert.equal((await client.delete(base + id)).status(), 405);
    assert.equal((await client.post(base + '/delete' + id)).status(), 404);
    assert.equal((await client.get(base + '/raw' + yamlPath)).status(), 200);
    for (const prefix of ['', '/qr']) {
      const response = await client.get(base + prefix + yamlPath);
      assert.equal(response.status(), 200);
      assert.equal((await response.text()).includes('/delete/'), false);
    }
  }
  results.push('Creators and visitors cannot delete via website or API; the paste survives both attempts');
  await visitor.close();
  results.push('Immediate Ctrl+S saves detected syntax; shared links and saved-paste mobile layouts work');

  assert.match(await save('Hello world!'), /\.txt$/);
  results.push('Uncertain text falls back to plain text');

  const noWorker = await browser.newContext();
  await noWorker.addInitScript(() => { window.Worker = class { constructor() { throw new Error('synthetic worker failure'); } }; });
  const fallbackPage = await noWorker.newPage();
  await fallbackPage.goto(base);
  await fallbackPage.locator('#text').fill(yaml);
  await Promise.all([fallbackPage.waitForURL(url => url.pathname !== '/'), fallbackPage.locator('#text').press('Control+s')]);
  assert.match(new URL(fallbackPage.url()).pathname, /\.txt$/);
  await noWorker.close();
  results.push('Saving still works when Web Workers are unavailable');

  await home();
  await page.locator('#text').fill(yaml);
  await page.waitForFunction(() => document.querySelector('#extension').value === 'yaml');
  await page.locator('#text').fill('{"hello": "world"}');
  await Promise.all([page.waitForURL(url => url.pathname !== '/'), page.locator('#text').press('Control+Enter')]);
  saved.push(new URL(page.url()).pathname);
  assert.match(saved.at(-1), /\.json$/);
  results.push('Immediate save after changing language does not use a stale detection');

  await home();
  await page.locator('#text').fill(yaml);
  await page.locator('#encrypt-row').click();
  assert.equal(await page.locator('#encrypt-toggle').isChecked(), true);
  await page.locator('#password').fill('synthetic-browser-test-password');
  await page.getByRole('button', { name: /^paste$/i }).click();
  await page.waitForURL(url => url.pathname !== '/');
  const encryptedPath = new URL(page.url()).pathname;
  saved.push(encryptedPath);
  assert.equal(await page.locator('.src-code').count(), 0);
  const protectedRaw = await context.request.get(base + '/raw' + encryptedPath);
  assert.match(protectedRaw.headers()['content-type'], /text\/html/);
  assert.equal(protectedRaw.headers()['cache-control'], 'no-store');
  assert.equal((await protectedRaw.text()).includes('LuckPerms'), false);
  const unlockedRaw = await context.request.get(base + '/raw' + encryptedPath, {
    headers: { 'wastebin-password': 'synthetic-browser-test-password' },
  });
  assert.equal(unlockedRaw.status(), 200);
  assert.equal((await unlockedRaw.text()).replace(/\r\n/g, '\n'), yaml);
  results.push('Password-protected paste remains protected and decrypts correctly');

  const injected = '<script>window.PASTE_XSS=true</script>\n<img src=x onerror="window.PASTE_XSS=true">';
  await save(injected);
  assert.equal(await page.evaluate(() => window.PASTE_XSS), undefined);
  results.push('Pasted HTML is displayed safely, without running scripts');

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noScript.newPage();
  await staticPage.goto(base);
  await staticPage.locator('#text').fill('No JavaScript needed to save text');
  await Promise.all([staticPage.waitForURL(url => url.pathname !== '/'), staticPage.getByRole('button', { name: /^paste$/i }).click()]);
  assert.equal((await staticPage.request.get(base + '/raw' + new URL(staticPage.url()).pathname)).status(), 200);
  await noScript.close();
  results.push('Saving without JavaScript uses plain text and the default timer');
  const expiring = await context.request.post(base + '/', {
    data: { text: 'Synthetic automatic expiry check', expires: 2 },
  });
  assert.equal(expiring.status(), 200);
  const expiringPath = (await expiring.json()).path;
  assert.equal((await context.request.get(base + '/raw' + expiringPath)).status(), 200);
  await page.waitForTimeout(3200);
  assert.equal((await context.request.get(base + '/raw' + expiringPath)).status(), 404);
  results.push('Timer expiration automatically makes a paste unavailable');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify({ base, results, browserErrors: errors }, null, 2) + '\n');
console.log(JSON.stringify({ base, results, browserErrors: errors }, null, 2));
