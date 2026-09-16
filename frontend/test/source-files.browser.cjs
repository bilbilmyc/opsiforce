// Read-only live verification. FILES_CASES is [{ projectId, sourcePath, contains }].
// The error/retry check mocks one listing response; it does not alter server state.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.FILES_BASE;
const cases = JSON.parse(process.env.FILES_CASES || '[]');
if (!base || !cases.length) throw new Error('Set FILES_BASE and FILES_CASES.');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(base + '/api/**', async route => {
      const req = route.request();
      if (req.method() === 'GET' || new URL(req.url()).pathname === '/api/users/me') return route.continue();
      if (req.method() === 'PATCH' && new URL(req.url()).pathname.endsWith('/session')) return route.fulfill({ json: { ok: true } });
      return route.abort();
    });
    for (const example of cases) {
      await page.goto(base + '/projects/' + example.projectId);
      await page.getByRole('tab', { name: '文件', exact: true }).click();
      const parts = example.sourcePath.split('/');
      for (const folder of parts.slice(0, -1)) {
        await page.getByRole('button', { name: '打开文件夹 ' + folder, exact: true }).click();
      }
      const filename = parts.at(-1);
      await page.getByRole('button', { name: '打开 ' + filename, exact: true }).click();
      await page.getByText(example.contains, { exact: false }).last().waitFor();
      const code = page.locator('pre[aria-label="' + filename + '"] code');
      await code.waitFor();
      const content = await page.request.get(base + '/api/projects/' + example.projectId + '/files/content?path=' + encodeURIComponent(example.sourcePath));
      assert.equal(content.status(), 200);
      assert.equal(await code.textContent(), await content.text(), 'source preview preserves exact text and indentation');
      assert.equal(await page.getByRole('button', { name: '删除', exact: true }).count(), 0);
      await page.getByRole('button', { name: '卡片视图', exact: true }).click();
      await page.getByRole('button', { name: '打开 ' + filename, exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '删除', exact: true }).count(), 0);
      await page.getByRole('button', { name: '表格视图', exact: true }).click();
      await page.screenshot({ path: `/tmp/opsiforce-files-${example.projectId}.png`, fullPage: true });
      console.log('PASS live source browser:', example.sourcePath);
    }
    const id = cases[0].projectId;
    const match = new RegExp('/api/projects/' + id + '/files(?:\\?|$)');
    const fail = route => route.fulfill({ status: 503, json: { message: 'Could not load workspace files' } });
    await page.route(match, fail);
    await page.goto(base + '/projects/' + id);
    await page.getByRole('tab', { name: '文件', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '无法读取此目录' }).waitFor({ timeout: 30000 });
    await page.unroute(match, fail);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('button', { name: '打开文件夹 ' + cases[0].sourcePath.split('/')[0], exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: directory errors are visible and retry recovers; no browser script errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
