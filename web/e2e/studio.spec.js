import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const captures = resolve('../recordings/frontend/dev-4');
test.beforeAll(async () => { await mkdir(captures, { recursive: true }); });
test.beforeEach(async ({ page }) => {
  page.__errors = [];
  page.on('pageerror', error => page.__errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('THREE.WebGLProgram')) page.__errors.push(message.text()); });
  await page.addInitScript(() => {
    window.permissionAttempts = { camera: 0, serial: 0 };
    navigator.mediaDevices.getUserMedia = async () => { window.permissionAttempts.camera++; throw new DOMException('Test camera denied', 'NotAllowedError'); };
    if (navigator.serial) navigator.serial.requestPort = async () => { window.permissionAttempts.serial++; throw new DOMException('Test picker cancelled', 'NotFoundError'); };
  });
  await page.goto('/');
  await expect(page.locator('#music-info')).toContainText('16 bars');
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-renderer', 'three');
});
test.afterEach(async ({ page }) => { expect(page.__errors).toEqual([]); });

async function closeSetup(page) { await page.locator('#settings .window-close').click(); await expect(page.locator('#settings')).not.toHaveAttribute('open', ''); }
async function enterListen(page) {
  await page.locator('#mode-manual').click();
  await page.locator('#setup-next').click();
  await expect(page.locator('#setup-next')).toHaveText('Enter studio');
  await page.locator('#setup-next').click();
  await expect(page.locator('#settings')).not.toHaveAttribute('open', '');
}
async function setState(page, data) { await page.evaluate(async data => Object.assign((await import('/src/state.js')).state, data), data); }

test('English initialization opens silently with no camera or serial request', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#settings')).toHaveAttribute('open', '');
  await expect(page.locator('#setup-mode')).toBeVisible();
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('#playback-status')).toHaveText('Stopped');
  expect(await page.evaluate(() => window.permissionAttempts)).toEqual({ camera: 0, serial: 0 });
  expect(await page.locator('body').innerText()).not.toMatch(/[\u4e00-\u9fff]/);
  await page.screenshot({ path: resolve(captures, 'initialization-desktop.png'), fullPage: true });
  await closeSetup(page);
  await expect(page.locator('#manual-tempo')).toBeDisabled();
  await expect(page.locator('#volume')).toBeDisabled();
  await page.locator('.skip-link').focus(); await expect(page.locator('.skip-link')).toHaveCSS('opacity', '1');
  await page.locator('#open-devices').focus(); await expect(page.locator('.skip-link')).toHaveCSS('opacity', '0');
  await page.screenshot({ path: resolve(captures, 'studio-desktop.png'), fullPage: true });
});

test('compiled Tailwind bounds icons, glass surfaces and desktop content', async ({ page }) => {
  await expect(page.locator('#studio')).toHaveCSS('display', 'grid');
  expect(Math.max(...await page.locator('svg').evaluateAll(icons => icons.map(icon => icon.getBoundingClientRect().width)))).toBeLessThanOrEqual(30);
  await expect(page.locator('#settings')).toHaveCSS('backdrop-filter', 'blur(26px) saturate(1.45)');
  await closeSetup(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1050);
});

test('uncompiled styles show bounded recovery before canvas initialization', async ({ page }) => {
  await page.route('**/src/style.css*', route => route.fulfill({ contentType: 'application/javascript', body: `const style=document.createElement('style');style.textContent='.studio { @apply grid; }';document.head.append(style);` }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The studio styles did not load.' })).toBeVisible();
  await expect(page.locator('#motion-canvas')).toHaveCount(0);
  await expect(page.locator('svg')).toHaveCount(0);
  expect(page.__errors).toEqual(['Studio styles are uncompiled. Restart Vite with the Tailwind plugin.']);
  page.__errors.length = 0;
});

test('synthetic device readiness gates every initialization step and preserves binding on close', async ({ page }) => {
  await page.locator('#setup-next').click();
  await expect(page.locator('#setup-right')).toBeVisible();
  await expect(page.locator('#setup-next')).toBeDisabled();
  await expect(page.locator('#calibrate')).toBeDisabled();
  await setState(page, { serialPhase: 'connected', serialConnected: true, calibrationState: 'ready' });
  await expect(page.locator('#setup-next')).toBeEnabled(); await page.locator('#setup-next').click();
  await expect(page.locator('#setup-left')).toBeVisible();
  await expect(page.locator('#setup-next')).toBeDisabled();
  await setState(page, { cameraReady: true, cameraPhase: 'running', leftHandBound: true, handTracked: true, handStatus: 'tracking' });
  await expect(page.locator('#setup-next')).toBeEnabled(); await page.locator('#setup-next').click();
  await expect(page.locator('#setup-ready')).toBeVisible(); await page.locator('#setup-next').click();
  await expect(page.locator('#play')).toBeEnabled();
  expect(await page.evaluate(async () => { const { state } = await import('/src/state.js'); return [state.serialConnected, state.cameraReady, state.leftHandBound, state.playbackState]; })).toEqual([true, true, true, 'stopped']);
});

test('Listen skips devices and real music pauses, resumes and rewinds', async ({ page }) => {
  await enterListen(page);
  expect(await page.evaluate(() => window.permissionAttempts)).toEqual({ camera: 0, serial: 0 });
  await page.locator('#manual-tempo').fill('140'); await page.locator('#volume').fill('-12');
  await expect(page.locator('#music-bpm')).toHaveText('140'); await expect(page.locator('#volume-value')).toHaveText('-12 dB');
  await page.locator('#play').click(); await expect(page.locator('#playback-status')).toHaveText('Playing');
  await expect.poll(() => page.locator('#music-progress').evaluate(p => p.value)).toBeGreaterThan(.035);
  await page.locator('#pause').click();
  const at = await page.locator('#music-progress').evaluate(p => p.value);
  await page.waitForTimeout(250); expect(await page.locator('#music-progress').evaluate(p => p.value)).toBe(at);
  await page.locator('#play').click(); await expect.poll(() => page.locator('#music-progress').evaluate(p => p.value)).toBeGreaterThan(at);
  await page.screenshot({ path: resolve(captures, 'studio-listening.png'), fullPage: true });
  await page.locator('#open-devices').click(); await page.locator('[data-setup-step=mode]').click();
  await expect(page.locator('#mode-conduct')).toBeDisabled(); await closeSetup(page);
  await page.locator('#stop').click(); await expect(page.locator('#playback-status')).toHaveText('Stopped');
  expect(await page.locator('#music-progress').evaluate(p => p.value)).toBe(0);
  await page.locator('#open-devices').click(); await page.locator('[data-setup-step=mode]').click();
  await page.locator('#mode-conduct').click(); await closeSetup(page); await expect(page.locator('#play')).toBeDisabled();
});

test('permission denial remains recoverable inside the camera setup window', async ({ page }) => {
  await page.locator('#setup-next').click();
  await setState(page, { serialPhase: 'connected', serialConnected: true, calibrationState: 'ready' });
  await expect(page.locator('#setup-next')).toBeEnabled(); await page.locator('#setup-next').click();
  await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-error')).toContainText('permission');
  await expect(page.locator('#camera-toggle')).toHaveText('Enable');
  await expect(page.locator('#settings')).toHaveAttribute('open', '');
  await expect(page.locator('#playback-status')).toHaveText('Stopped');
});

test('windows replace one another, trap focus, freeze visuals and keep real audio playing', async ({ page }) => {
  await enterListen(page); await page.locator('#play').click();
  await page.locator('#open-preferences').click();
  await expect(page.locator('#preferences')).toHaveAttribute('open', '');
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.sceneSuspended)).toBe(true);
  const frame = await page.locator('#motion-canvas').getAttribute('data-frame'); await page.waitForTimeout(200);
  expect(await page.locator('#motion-canvas').getAttribute('data-frame')).toBe(frame);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.closest('dialog')?.id)).toBe('preferences');
  await page.locator('#open-diagnostics').click();
  expect(await page.locator('dialog[open]').count()).toBe(1);
  await expect(page.locator('#diagnostics')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape'); await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.sceneSuspended)).toBe(false);
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await page.locator('#pause').click();
});

test('copyable snapshots and session CSV remain available in their windows', async ({ page }) => {
  await closeSetup(page); await page.locator('#open-preferences').click(); await page.locator('#open-diagnostics').click();
  await page.locator('#copy-debug').click();
  const snapshot = await page.locator('#debug-snapshot').inputValue(); expect(snapshot).toContain('Playback: stopped');
  await page.locator('[data-open-window=preferences]').last().click();
  const downloaded = page.waitForEvent('download'); await page.locator('#export').click();
  expect((await downloaded).suggestedFilename()).toMatch(/^air-conductor-beats-.*\.csv$/);
  await page.locator('#open-diagnostics').click(); expect(await page.locator('#debug-snapshot').inputValue()).toBe(snapshot);
});

test('phone and tablet layouts keep initialization and playback reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(captures, 'initialization-mobile.png'), fullPage: true });
  await enterListen(page);
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('#play')).toBeVisible();
    await page.locator('#open-preferences').click(); await expect(page.locator('#scene-theme')).toBeVisible();
    expect(await page.locator('#preferences').evaluate(dialog => dialog.getBoundingClientRect().width)).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('#motion-canvas').getAttribute('data-frame')).not.toBe(null);
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(captures, 'studio-mobile.png'), fullPage: true });
});

test('missing Web Serial still offers keyboard-operated Listen', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true }));
  await page.reload(); await expect(page.locator('#music-info')).toContainText('16 bars');
  await page.locator('#setup-next').click(); await expect(page.locator('#connect')).toBeDisabled();
  await expect(page.locator('#ready-title')).toHaveText('Open in Chrome or Edge.');
  await page.locator('[data-setup-step=mode]').click();
  await page.locator('#mode-manual').focus(); await page.keyboard.press('Enter');
  await page.locator('#setup-next').click(); await page.locator('#setup-next').click();
  await page.locator('#manual-tempo').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#music-bpm')).toHaveText('101');
});

test('confirmed synthetic left loss retains volume-hold feedback', async ({ page }) => {
  await closeSetup(page);
  await setState(page, { serialPhase: 'connected', serialConnected: true, calibrationState: 'ready', cameraReady: true, cameraPhase: 'running', leftHandBound: true, handStatus: 'lost', volumeSource: 'left-hand' });
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#hand-status')).toContainText('Looking for your left hand');
  await expect(page.locator('#volume-help')).toContainText('Volume holds');
});

test('initialization, studio and every window pass bounded automated accessibility audits', async ({ page }) => {
  const audit = async () => {
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, message: n.failureSummary })) }))).toEqual([]);
  };
  await audit(); await enterListen(page); await audit();
  for (const id of ['open-devices', 'open-preferences', 'open-help']) { await page.locator(`#${id}`).click(); await audit(); await page.keyboard.press('Escape'); }
  await page.locator('#open-preferences').click(); await page.locator('#open-diagnostics').click(); await audit();
});

test('fullscreen exit survives lost device readiness', async ({ page }) => {
  await enterListen(page); await page.locator('#focus').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('studio');
  await setState(page, { experienceMode: 'conduct' });
  await expect(page.locator('#focus')).toBeEnabled(); await page.locator('#focus').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
});

test('palette and reduced-motion changes retain real audio playback', async ({ page }) => {
  await enterListen(page); await page.locator('#play').click(); await page.locator('#open-preferences').click();
  await page.locator('#scene-theme').selectOption('nocturne'); await page.locator('#reduce-motion').check();
  await page.locator('#gesture-controls').check(); await expect(page.locator('#gesture-controls')).toBeChecked();
  await page.locator('#gesture-controls').uncheck(); await expect(page.locator('#gesture-controls')).not.toBeChecked();
  await page.screenshot({ path: resolve(captures, 'settings-desktop.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-scene-theme', 'nocturne');
  await expect(page.locator('#app')).toHaveAttribute('data-motion', 'reduced');
  await page.waitForTimeout(150); const frame = await page.locator('#motion-canvas').screenshot({ path: resolve(captures, 'reduced-motion-first.png') });
  await page.waitForTimeout(250); expect((await page.locator('#motion-canvas').screenshot({ path: resolve(captures, 'reduced-motion-second.png') })).equals(frame)).toBe(true);
  await expect(page.locator('#playback-status')).toHaveText('Playing');
});

test('system reduced motion is reflected even behind the initial window', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await closeSetup(page);
  await page.locator('#open-preferences').click();
  await expect(page.locator('#reduce-motion')).toBeChecked(); await expect(page.locator('#reduce-motion')).toBeDisabled();
});

test('GPU context loss and recovery keep audio available', async ({ page }) => {
  await enterListen(page); await page.locator('#play').click();
  await page.evaluate(() => { window.contextLoss = document.querySelector('#motion-canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); window.contextLoss.loseContext(); });
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-renderer', 'lost');
  await expect(page.locator('#playback-status')).toHaveText('Playing'); await page.waitForTimeout(250);
  await page.evaluate(() => window.contextLoss.restoreContext());
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-renderer', 'three', { timeout: 10000 });
});

test('unavailable WebGL retains initialization and real Listen playback', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type.startsWith('webgl') ? null : original.call(this, type, ...args); }; });
  await page.reload(); await expect(page.locator('#music-info')).toContainText('16 bars');
  await expect(page.locator('#stage')).toHaveAttribute('data-scene', 'fallback');
  await enterListen(page); await page.locator('#play').click(); await expect(page.locator('#playback-status')).toHaveText('Playing');
  await page.locator('#pause').click(); await expect(page.locator('#playback-status')).toHaveText('Paused');
});

test('large viewport respects GPU pixel budget', async ({ page }) => {
  await enterListen(page); await page.setViewportSize({ width: 2560, height: 1440 });
  await expect.poll(() => page.locator('#motion-canvas').evaluate(canvas => canvas.width * canvas.height)).toBeLessThanOrEqual(600000);
});

test('synthetic frames render a GPU hand ribbon and release resources', async ({ page }) => {
  await closeSetup(page);
  const report = await page.evaluate(async () => {
    const { MotionStage } = await import('/src/motion-stage.js'); const { createState } = await import('/src/state.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:10px;top:10px;width:600px;height:440px;z-index:100;background:#f5f7fc;';
    const canvas = document.createElement('canvas'); canvas.id = 'synthetic-motion'; canvas.style.cssText = 'width:100%;height:100%;'; host.append(canvas); document.body.append(host);
    const state = { ...createState(), cameraReady: true, leftHandBound: true, leftHandLabel: 'Left', handTracked: true, playbackState: 'playing', palmX: .25, palmY: .7 };
    const stage = new MotionStage(canvas, state); const renderer = stage.renderer; stage.pulse(.9);
    const now = performance.now();
    for (let i = 0; i < 12; i++) { state.cameraFrames++; state.palmX = .25 + i * .035; state.palmY = .65 - Math.sin(i * .25) * .3; stage.draw(now + i * 40); }
    const report = { renderer: canvas.dataset.renderer, trailIndices: stage.ribbonTrail.geometry.drawRange.count, triangles: renderer.info.render.triangles, error: renderer.getContext().getError() };
    stage.running = false; stage.cancel(); window.syntheticScene = { stage, renderer, host }; return report;
  });
  expect(report.renderer).toBe('three'); expect(report.trailIndices).toBeGreaterThan(0); expect(report.error).toBe(0);
  await page.locator('#synthetic-motion').screenshot({ path: resolve(captures, 'synthetic-motion.png') });
  report.geometriesAfterDispose = await page.evaluate(() => { const { stage, renderer, host } = window.syntheticScene; stage.dispose(); host.remove(); delete window.syntheticScene; return renderer.info.memory.geometries; });
  expect(report.geometriesAfterDispose).toBe(0);
  await writeFile(resolve(captures, 'scene-checks.json'), JSON.stringify({ checkedAt: new Date().toISOString(), syntheticInput: true, physicalDevicesOpened: false, ...report }, null, 2) + '\n');
});
