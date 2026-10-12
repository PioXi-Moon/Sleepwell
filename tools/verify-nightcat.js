const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const dependencyRoot = process.env.NIGHTCAT_NODE_MODULES || 'C:/Users/16494/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const runtimeRequire = createRequire(path.join(dependencyRoot, 'runtime.js'));
const { chromium } = runtimeRequire('playwright');
const root = path.resolve(__dirname, '..');

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.NIGHTCAT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
    const checks = [];
    for (const [width, height] of [[320, 640], [375, 812], [430, 932]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:4180');
      const check = await page.evaluate(() => ({
        width: innerWidth,
        overflow: document.body.scrollWidth > innerWidth,
        assets: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
        buttons: [...document.querySelectorAll('.topic-button,.guide-button,.night-composer,.night-nav-item')].map((button) => {
          const box = button.getBoundingClientRect();
          return { label: button.innerText, width: box.width, height: box.height, inside: box.x >= 0 && box.right <= innerWidth };
        })
      }));
      checks.push(check);
      console.log('Viewport', width, JSON.stringify(check));
      if (check.overflow || !check.assets || check.buttons.some((button) => !button.inside || button.height < 43.9)) throw new Error('Layout, touch target or asset check failed');
      await page.screenshot({ path: path.join(root, 'docs/design/preview-' + width + '.png') });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://127.0.0.1:4180');
    console.log('Opening topic');
    await page.getByRole('button', { name: '考试焦虑', exact: true }).click();
    console.log('Draft:', await page.locator('input').inputValue());
    await page.locator('input').fill('今晚脑子停不下来，我想先慢慢放松。');
    console.log('Sending');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.locator('.chat-error').waitFor();
    await page.screenshot({ path: path.join(root, 'docs/design/preview-chat.png') });
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await page.locator('.chat-error').waitFor();
    console.log('Retained message:', await page.locator('.chat-bubble--user').innerText());
    await page.evaluate(() => window.keyboardListener({ height: 300 }));
    const keyboardCheck = await page.locator('.chat-input-row').boundingBox();
    if (keyboardCheck.y + keyboardCheck.height > 512.5) throw new Error('Input overlaps keyboard');
    await page.screenshot({ path: path.join(root, 'docs/design/preview-keyboard.png') });
    await page.getByRole('button', { name: '返回夜喵首页', exact: true }).click();
    await page.getByRole('button', { name: '记录', exact: true }).click();
    console.log('Records:', await page.locator('.night-records').innerText());
    await page.screenshot({ path: path.join(root, 'docs/design/preview-records.png') });
    await page.getByRole('button', { name: '关闭记录', exact: true }).click();
    await page.getByRole('button', { name: '开始引导', exact: true }).click();
    const route = await page.evaluate(() => window.lastNavigation);
    if (route.url !== '/pages/focus/index') throw new Error('Wrong guide route');
    if (errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(path.join(root, 'docs/design/browser-checks.json'), JSON.stringify({ checks, keyboardCheck, route, errors }, null, 2));
    console.log('Browser verification passed');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
