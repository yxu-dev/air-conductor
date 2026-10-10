import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const captures = resolve('../recordings/frontend');
test.beforeAll(async () => { await mkdir(captures, { recursive: true }); });
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.__errors = errors;
  await page.goto('/');
  await expect(page.locator('#music-info')).toContainText('16 bars');
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
