import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
try {
  await mkdir('../recordings/frontend', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    window.renderProfile = { longTasks: [], gaps: [], samples: 0 };
    new PerformanceObserver(list => list.getEntries().forEach(e => window.renderProfile.longTasks.push(e.duration))).observe({ type: 'longtask', buffered: true });
    let previous;
    const frame = now => { if (previous) window.renderProfile.gaps.push(now - previous); previous = now; window.renderProfile.samples++; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  const url = process.env.STUDIO_URL ?? 'http://127.0.0.1:5173/';
  const stylesheet = await page.request.get(`${url.replace(/\/$/, '')}/src/style.css`);
  assert.equal(stylesheet.status(), 200);
  const css = await stylesheet.text();
  assert.ok(!css.includes('@apply') && !css.includes('@theme'), 'The live server is not compiling Tailwind; restart Vite.');
  await page.goto(url);
  await page.locator('#music-info').filter({ hasText: '16 bars' }).waitFor();
  await page.locator('#motion-canvas[data-renderer="three"]').waitFor();
  const layout = await page.evaluate(() => ({ display: getComputedStyle(document.querySelector('#studio')).display,
    widestIcon: Math.max(...[...document.querySelectorAll('svg')].map(svg => svg.getBoundingClientRect().width)) }));
  assert.equal(layout.display, 'grid');
  assert.ok(layout.widestIcon <= 30, 'An SVG icon has expanded unexpectedly.');
  await page.screenshot({ path: '../recordings/frontend/live-initialization.png', fullPage: true });
  const startupLongestTaskMs = await page.evaluate(() => {
    const longest = Math.max(0, ...window.renderProfile.longTasks);
    window.renderProfile.longTasks = []; window.renderProfile.gaps = []; window.renderProfile.samples = 0;
    return longest;
  });
  await page.locator('#mode-manual').click();
  await page.locator('#setup-next').click();
  await page.locator('#setup-next').click();
  await page.screenshot({ path: '../recordings/frontend/live-server-desktop.png', fullPage: true });
  await page.locator('#play').click();
  await page.locator('#motion-canvas').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '../recordings/frontend/live-server-playing.png', fullPage: true });
  await page.waitForTimeout(5000);
  const clickStart = performance.now();
  await page.locator('#pause').click();
  await page.locator('#playback-status').filter({ hasText: 'Paused' }).waitFor();
  const pauseResponseMs = performance.now() - clickStart;
  const report = await page.evaluate(() => {
    const { longTasks, gaps, samples } = window.renderProfile;
    gaps.sort((a, b) => a - b);
    const canvas = document.querySelector('#motion-canvas');
    return { samples, longTasks: longTasks.length, longestTaskMs: Math.max(0, ...longTasks), p95FrameGapMs: gaps[Math.floor(gaps.length * .95)],
      canvasPixels: canvas.width * canvas.height, renderThread: canvas.dataset.renderThread ?? 'main', sceneQuality: canvas.dataset.quality ?? 'fixed' };
  });
  Object.assign(report, { checkedAt: new Date().toISOString(), url, compiledTailwind: true, ...layout, startupLongestTaskMs, pauseResponseMs, headless: true, physicalDevicesOpened: false });
  assert.ok(report.canvasPixels <= 600000);
  assert.ok(pauseResponseMs < 1000, 'Pause did not respond within one second.');
  console.log(JSON.stringify(report, null, 2));
  if (process.env.PROFILE_OUTPUT) await writeFile(process.env.PROFILE_OUTPUT, JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); }
