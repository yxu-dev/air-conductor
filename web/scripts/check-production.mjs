import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

// Isolated built-app check. Never requests camera access or a serial port.
const output = resolve('../recordings/frontend');
const reports = [];
const server = await preview({ preview: { host: '127.0.0.1', port: 5175, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5175/');
  await page.locator('#music-info').filter({ hasText: '16 bars' }).waitFor();
  assert.equal(await page.locator('#play').isDisabled(), true);
  reports.push({ check: 'built studio starts silently and gates Conduct', pass: true });
  await page.locator('#motion-canvas[data-renderer="three"]').waitFor();
  reports.push({ check: 'built lazy-loaded Three.js scene creates a real WebGL renderer', pass: true });

  for (const [url, minimum] of [['/midi/ode.mid', 100], ['/models/gesture_recognizer.task', 100000], ['/mediapipe/vision_bundle.js', 100000], ['/mediapipe/vision-worker.js', 100], ['/mediapipe/wasm/vision_wasm_internal.wasm', 100000]]) {
    const response = await page.request.get(`http://127.0.0.1:5175${url}`);
    assert.equal(response.status(), 200);
    assert.ok((await response.body()).length > minimum, `${url} is missing`);
    assert.ok(!response.headers()['content-type']?.includes('text/html'), `${url} fell back to the app document`);
  }
  reports.push({ check: 'built music, model, Worker and WASM assets are served locally', pass: true });

  await page.locator('#mode-manual').click();
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#music-progress').value > .03);
  await page.locator('#visual-settings > summary').click();
  await page.locator('#scene-theme').selectOption('nocturne');
  await page.locator('#motion-canvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#motion-canvas').dataset.sceneTheme === 'nocturne');
  await page.locator('#reduce-motion').check();
  assert.equal(await page.locator('#app').getAttribute('data-motion'), 'reduced');
  assert.equal(await page.locator('#playback-status').textContent(), 'Playing');
  reports.push({ check: 'built palette and reduced-motion controls leave real audio playing', pass: true });
  await page.locator('#pause').click();
  const paused = await page.locator('#music-progress').evaluate(p => p.value);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#music-progress').evaluate(p => p.value), paused);
  await page.locator('#play').click();
  await page.waitForFunction(at => document.querySelector('#music-progress').value > at, paused);
  reports.push({ check: 'built real audio pauses and resumes from retained position', pass: true });
  await page.locator('#stop').click();
  assert.equal(await page.locator('#playback-status').textContent(), 'Stopped');
  assert.equal(await page.locator('#music-progress').evaluate(p => p.value), 0);
  reports.push({ check: 'built End action rewinds and unlocks mode selection', pass: true });
  assert.equal(await page.locator('#mode-conduct').isEnabled(), true);
  assert.deepEqual(errors, []);
  reports.push({ check: 'no uncaught browser errors', pass: true });
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'production-checks.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: reports.length, headless: true, audioMuted: true, physicalDevicesOpened: false, reports }, null, 2) + '\n');
  console.log(`${reports.length} production checks passed.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
