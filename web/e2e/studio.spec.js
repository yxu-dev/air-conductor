import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const captures = resolve('../recordings/frontend');
test.beforeAll(async () => { await mkdir(captures, { recursive: true }); });
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('THREE.WebGLProgram')) errors.push(message.text()); });
  page.__errors = errors;
  await page.goto('/');
  await expect(page.locator('#music-info')).toContainText('16 bars');
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-renderer', 'three');
});
test.afterEach(async ({ page }) => { expect(page.__errors).toEqual([]); });

test('English guided entry is silent, gated and visually complete', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('#ready-title')).toHaveText('Connect your right hand.');
  await expect(page.locator('#manual-tempo')).toBeDisabled();
  await expect(page.locator('#volume')).toBeDisabled();
  await expect(page.locator('#playback-status')).toHaveText('Stopped');
  await expect(page.locator('#settings')).not.toHaveAttribute('open', '');
  expect(await page.locator('body').innerText()).not.toMatch(/[\u4e00-\u9fff]/);
  await page.locator('.skip-link').focus();
  await expect(page.locator('.skip-link')).toHaveCSS('opacity', '1');
  await page.locator('#mode-conduct').focus();
  await expect(page.locator('.skip-link')).toHaveCSS('opacity', '0');
  await page.screenshot({ path: resolve(captures, 'studio-desktop.png'), fullPage: true });
});

test('Listen plays real music; pause retains position, resume continues, end rewinds', async ({ page }) => {
  await page.locator('#mode-manual').click();
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#manual-tempo')).toBeEnabled();
  await page.locator('#manual-tempo').fill('140');
  await page.locator('#volume').fill('-12');
  await expect(page.locator('#music-bpm')).toHaveText('140');
  await expect(page.locator('#volume-value')).toHaveText('-12 dB');
  await page.locator('#play').click();
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await expect.poll(() => page.locator('#music-progress').evaluate(p => p.value)).toBeGreaterThan(.035);
  await page.locator('#pause').click();
  await expect(page.locator('#playback-status')).toHaveText('Paused');
  const at = await page.locator('#music-progress').evaluate(p => p.value);
  await page.waitForTimeout(300);
  expect(await page.locator('#music-progress').evaluate(p => p.value)).toBe(at);
  await page.locator('#play').click();
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await expect.poll(() => page.locator('#music-progress').evaluate(p => p.value)).toBeGreaterThan(at);
  await expect(page.locator('#mode-conduct')).toBeDisabled();
  await page.screenshot({ path: resolve(captures, 'studio-listening.png'), fullPage: true });
  await page.locator('#stop').click();
  await expect(page.locator('#playback-status')).toHaveText('Stopped');
  expect(await page.locator('#music-progress').evaluate(p => p.value)).toBe(0);
  await expect(page.locator('#mode-conduct')).toBeEnabled();
  await page.locator('#mode-conduct').click();
  await expect(page.locator('#play')).toBeDisabled();
});

test('camera permission denial has a recovery message and does not start music', async ({ page }) => {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-error')).toContainText('permission');
  await expect(page.locator('#camera-toggle')).toHaveText('Enable');
  await expect(page.locator('#playback-status')).toHaveText('Stopped');
  await expect(page.locator('#settings')).toHaveAttribute('open', '');
});

test('diagnostic snapshots remain selectable and CSV is downloadable', async ({ page }) => {
  await page.locator('#settings > summary').click();
  await page.locator('.diagnostics > summary').click();
  await page.locator('#copy-debug').click();
  const snapshot = await page.locator('#debug-snapshot').inputValue();
  expect(snapshot).toContain('Playback: stopped');
  await page.locator('#mode-manual').click();
  expect(await page.locator('#debug-snapshot').inputValue()).toBe(snapshot);
  const downloaded = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/^air-conductor-beats-.*\.csv$/);
});

test('narrow screens retain reachable controls and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#play')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: resolve(captures, 'studio-mobile.png'), fullPage: true });
  await page.locator('#mode-manual').click();
  await expect(page.locator('#volume')).toBeEnabled();
  await page.locator('#settings > summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('missing Web Serial still offers Listen and keyboard controls', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true }));
  await page.reload();
  await expect(page.locator('#ready-title')).toHaveText('Open in Chrome or Edge.');
  await expect(page.locator('#connect')).toBeDisabled();
  await page.locator('#mode-manual').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#manual-tempo').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#music-bpm')).toHaveText('101');
});

test('synthetic tracking state exposes readiness and held-volume messaging', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    Object.assign(state, { serialPhase: 'connected', serialConnected: true, calibrationState: 'ready', cameraReady: true, cameraPhase: 'running', leftHandBound: true, handStatus: 'lost', volumeSource: 'left-hand' });
  });
  await expect(page.locator('#setup-progress')).toHaveText('4 / 4 READY');
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#hand-status')).toContainText('Looking for your left hand');
  await expect(page.locator('#volume-help')).toContainText('Volume holds');
  // Synthetic UI state only: no camera permission or serial port is opened.
});

test('studio, settings and diagnostics have no automated accessibility violations', async ({ page }) => {
  await page.locator('#mode-manual').click();
  await page.locator('#settings > summary').click();
  await page.locator('.diagnostics > summary').click();
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, message: n.failureSummary })) }))).toEqual([]);
  await page.locator('#mode-conduct').click();
  const conducting = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(conducting.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, message: n.failureSummary })) }))).toEqual([]);
});

test('fullscreen studio enters and exits without changing playback', async ({ page }) => {
  await expect(page.locator('#focus')).toBeDisabled();
  await page.locator('#mode-manual').click();
  await page.locator('#focus').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('studio');
  await expect(page.locator('#focus')).toHaveAttribute('aria-label', 'Exit fullscreen studio');
  await expect(page.locator('#playback-status')).toHaveText('Stopped');
  // Device readiness may disappear in fullscreen; the exit control must survive.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.experienceMode = 'conduct';
  });
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'conduct');
  await expect(page.locator('#focus')).toBeEnabled();
  await page.locator('#focus').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
});

test('small phone and tablet layouts remain within their viewport', async ({ page }) => {
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('#play')).toBeVisible();
  }
});

test('Three scene themes and reduced motion do not change music playback', async ({ page }) => {
  await page.locator('#mode-manual').click(); await page.locator('#play').click();
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await page.locator('#visual-settings > summary').click();
  await page.locator('#scene-theme').selectOption('nocturne');
  await page.locator('#motion-canvas').scrollIntoViewIfNeeded();
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-scene-theme', 'nocturne');
  await expect(page.locator('#music-bpm')).toHaveText('100');
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await page.screenshot({ path: resolve(captures, 'studio-nocturne.png'), fullPage: true });
  await page.locator('#reduce-motion').check();
  await expect(page.locator('#app')).toHaveAttribute('data-motion', 'reduced');
  await page.locator('#motion-canvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const first = await page.locator('#motion-canvas').screenshot();
  await page.waitForTimeout(250);
  expect((await page.locator('#motion-canvas').screenshot()).equals(first)).toBe(true);
  await expect(page.locator('#playback-status')).toHaveText('Playing');
});

test('system reduced motion is respected in the actual 3D scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#visual-settings > summary').click();
  await expect(page.locator('#reduce-motion')).toBeChecked();
  await expect(page.locator('#reduce-motion')).toBeDisabled();
  await expect(page.locator('#app')).toHaveAttribute('data-motion', 'reduced');
});

test('GPU context loss and restoration leave audio available', async ({ page }) => {
  await page.locator('#mode-manual').click(); await page.locator('#play').click();
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await page.evaluate(() => {
    window.contextLoss = document.querySelector('#motion-canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
    window.contextLoss.loseContext();
  });
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-renderer', 'lost');
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await page.waitForTimeout(250);
  await page.evaluate(() => window.contextLoss.restoreContext());
  await expect(page.locator('#motion-canvas')).toHaveAttribute('data-renderer', 'three', { timeout: 10000 });
  await expect(page.locator('#playback-status')).toHaveText('Playing');
});

test('unavailable WebGL degrades to a static view while real Listen audio works', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
    };
  });
  await page.reload();
  await expect(page.locator('#stage')).toHaveAttribute('data-scene', 'fallback');
  await page.locator('#mode-manual').click(); await page.locator('#play').click();
  await expect(page.locator('#playback-status')).toHaveText('Playing');
  await page.locator('#pause').click();
  await expect(page.locator('#playback-status')).toHaveText('Paused');
});

test('synthetic left frames and sensor beats render a real GPU ribbon, then release resources', async ({ page }) => {
  const report = await page.evaluate(async () => {
    const { MotionStage } = await import('/src/motion-stage.js');
    const { createState } = await import('/src/state.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:10px;top:10px;width:600px;height:440px;z-index:100;background:#11231e;';
    const canvas = document.createElement('canvas'); canvas.id = 'synthetic-motion'; canvas.style.cssText = 'width:100%;height:100%;'; host.append(canvas); document.body.append(host);
    const state = { ...createState(), cameraReady: true, leftHandBound: true, leftHandLabel: 'Left', handTracked: true, playbackState: 'playing', palmX: .25, palmY: .7 };
    const stage = new MotionStage(canvas, state); const renderer = stage.renderer;
    stage.pulse(.9);
    const now = performance.now();
    for (let i = 0; i < 12; i++) {
      state.cameraFrames++; state.palmX = .25 + i * .035; state.palmY = .65 - Math.sin(i * .25) * .3;
      stage.draw(now + i * 40);
    }
    const report = { renderer: canvas.dataset.renderer, trailIndices: stage.ribbonTrail.geometry.drawRange.count,
      triangles: renderer.info.render.triangles, error: renderer.getContext().getError() };
    stage.running = false; stage.cancel();
    window.syntheticScene = { stage, renderer, host };
    return report;
  });
  expect(report.renderer).toBe('three'); expect(report.trailIndices).toBeGreaterThan(0);
  expect(report.triangles).toBeGreaterThan(0); expect(report.error).toBe(0);
  await page.locator('#synthetic-motion').screenshot({ path: resolve(captures, 'synthetic-motion.png') });
  report.geometriesAfterDispose = await page.evaluate(() => {
    const { stage, renderer, host } = window.syntheticScene;
    stage.dispose(); host.remove(); delete window.syntheticScene;
    return renderer.info.memory.geometries;
  });
  expect(report.geometriesAfterDispose).toBe(0);
  await writeFile(resolve(captures, 'scene-checks.json'), JSON.stringify({ checkedAt: new Date().toISOString(), syntheticInput: true, physicalDevicesOpened: false, ...report }, null, 2) + '\n');
});
