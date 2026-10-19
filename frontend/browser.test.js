import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PASTE_BASE_URL || 'http://127.0.0.1:8088';
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
const cleanupErrors = [];

async function home() {
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await page.locator('#auto-language').waitFor({ state: 'attached' });
}

async function selectLanguage(target, extension) {
  const index = await target.locator('#langs option').evaluateAll((options, ext) =>
    options.findIndex(option => (option.dataset.extensions || '').split(',').includes(ext)), extension);
  assert.ok(index > 0, `manual language ${extension} exists`);
  await target.locator('#langs').selectOption({ index });
}

function deletionUrl(path) {
  // The DELETE API accepts the paste ID; the display URL also has an extension.
  return base + new URL(path, base).pathname.replace(/\.[^/.]+$/, '');
}

async function save(text, { extension, immediate = false } = {}) {
  await home();
  await page.locator('#text').fill(text);
  if (extension) await selectLanguage(page, extension);
  if (!immediate && !extension) await page.waitForFunction(() => document.querySelector('#auto-language').textContent.includes(' · '));
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
    await page.waitForFunction(() => document.querySelector('#auto-language').value === 'yaml');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true });
  }
  results.push('Auto-detection and responsive layout at 320, 390, 768 and 1440px');
  assert.equal(await page.locator('#expiry-list input:checked').inputValue(), '604800');
  assert.equal(await page.title(), 'Blocksmith Paste');
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
  await visitor.close();
  results.push('Immediate Ctrl+S saves detected syntax; shared links and saved-paste mobile layouts work');

  const manualPath = await save(yaml, { extension: 'txt' });
  assert.match(manualPath, /\.txt$/);
  assert.equal(await page.locator('.src-code .yaml').count(), 0);
  assert.match(await save('Hello world!'), /\.txt$/);
  results.push('Manual plain-text override and uncertain-text fallback');

  const noWorker = await browser.newContext();
  await noWorker.addInitScript(() => { window.Worker = class { constructor() { throw new Error('synthetic worker failure'); } }; });
  const fallbackPage = await noWorker.newPage();
  await fallbackPage.goto(base);
  await fallbackPage.locator('#text').fill(yaml);
  await Promise.all([fallbackPage.waitForURL(url => url.pathname !== '/'), fallbackPage.locator('#text').press('Control+s')]);
  assert.match(new URL(fallbackPage.url()).pathname, /\.txt$/);
  assert.equal((await fallbackPage.request.delete(deletionUrl(fallbackPage.url()))).status(), 200);
  await noWorker.close();
  results.push('Saving still works when Web Workers are unavailable');

  await home();
  await page.locator('#text').fill(yaml);
  await page.waitForFunction(() => document.querySelector('#auto-language').value === 'yaml');
  await page.locator('#text').fill('{"hello": "world"}');
  await Promise.all([page.waitForURL(url => url.pathname !== '/'), page.locator('#text').press('Control+Enter')]);
  saved.push(new URL(page.url()).pathname);
  assert.match(saved.at(-1), /\.json$/);
  results.push('Immediate save after changing language does not use a stale detection');

  await home();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#open').click();
  await (await chooser).setFiles({ name: 'settings.yml', mimeType: 'text/plain', buffer: Buffer.from(yaml) });
  await page.waitForFunction(() => document.querySelector('#title').value === 'settings.yml');
  assert.equal(await page.locator('#langs').inputValue(), 'yaml');
  results.push('Uploaded .yml files map to the renderer’s canonical YAML extension');

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
  await save(injected, { extension: 'xml' });
  assert.equal(await page.evaluate(() => window.PASTE_XSS), undefined);
  results.push('Pasted HTML is displayed safely, without running scripts');

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noScript.newPage();
  await staticPage.goto(base);
  await staticPage.locator('#text').fill('No JavaScript needed to save text');
  await selectLanguage(staticPage, 'txt');
  await Promise.all([staticPage.waitForURL(url => url.pathname !== '/'), staticPage.getByRole('button', { name: /^paste$/i }).click()]);
  assert.equal((await staticPage.request.get(base + '/raw' + new URL(staticPage.url()).pathname)).status(), 200);
  assert.equal((await staticPage.request.delete(deletionUrl(staticPage.url()))).status(), 200);
  await noScript.close();
  results.push('Manual selection, saving and deletion work without JavaScript');
  assert.deepEqual(errors, []);
} finally {
  for (const path of saved) {
    const response = await context.request.delete(deletionUrl(path));
    if (response.status() !== 200) cleanupErrors.push(`${path}: ${response.status()}`);
  }
  await browser.close();
}
assert.deepEqual(cleanupErrors, [], 'all synthetic pastes deleted');
await writeFile(`${output}/results.json`, JSON.stringify({ base, results, browserErrors: errors }, null, 2) + '\n');
console.log(JSON.stringify({ base, results, browserErrors: errors }, null, 2));
