import test from 'node:test';
import assert from 'node:assert/strict';
import { TempoEstimator } from '../src/tempo.js';
import { readFileSync } from 'node:fs';

function seeded(bpm) {
  const estimator = new TempoEstimator();
  const interval = 60000 / bpm;
  for (let i = 0; i <= 12; ++i) estimator.add(Math.round(i * interval), i * interval);
  return { estimator, at: Math.round(12 * interval) };
}

for (const bpm of [60, 90, 120, 150]) {
  test(`steady ${bpm} BPM uses device time despite receipt jitter`, () => {
    const estimator = new TempoEstimator();
    for (let i = 0; i < 16; ++i) estimator.add(Math.round(i * 60000 / bpm), i * 60000 / bpm + [120, 210, 90][i % 3]);
    assert.ok(Math.abs(estimator.bpm - bpm) < .2);
    assert.equal(estimator.status, 'tracking');
  });
}

test('a short false beat preserves the last accepted timing anchor', () => {
  const { estimator, at } = seeded(60);
  assert.equal(estimator.add(at + 200, at + 200).reason, 'short');
  estimator.add(at + 1000, at + 1000);
  assert.equal(estimator.bpm, 60);
});

test('one missed beat does not halve the tempo', () => {
  const { estimator, at } = seeded(120);
  assert.equal(estimator.add(at + 1000, at + 1000).reason, 'tempo-candidate');
  estimator.add(at + 1500, at + 1500);
  assert.equal(estimator.bpm, 120);
  assert.equal(estimator.pending.length, 0);
});

for (const [from, to] of [[60, 120], [120, 60], [90, 150]]) {
  test(`sustained change ${from} to ${to} BPM is confirmed and followed`, () => {
    const { estimator, at } = seeded(from);
    for (let i = 1; i <= 12; ++i) estimator.add(Math.round(at + i * 60000 / to), at + i * 60000 / to);
    assert.ok(Math.abs(estimator.bpm - to) < 2);
  });
}

test('idle retains BPM and the next beat starts a fresh interval history', () => {
  const { estimator, at } = seeded(90);
  const old = estimator.bpm;
  assert.equal(estimator.snapshot(at + 3000).status, 'idle');
  estimator.add(at + 5000, at + 5000);
  assert.equal(estimator.bpm, old);
  assert.equal(estimator.intervals.length, 0);
  assert.equal(estimator.status, 'warming');
});

test('clock wrap is normal but device restart clears the old estimate', () => {
  const estimator = new TempoEstimator();
  for (let i = 0; i < 8; ++i) estimator.add((2 ** 32 - 1500 + i * 500) % 2 ** 32, i * 500);
  assert.equal(estimator.bpm, 120);
  assert.equal(estimator.add(1, 3600).reason, 'clock-reset');
  assert.equal(estimator.bpm, null);
});

test('malformed timestamps/receipt times cannot change tempo', () => {
  const { estimator } = seeded(60);
  for (const [timestamp, now] of [[NaN, 1], [-1, 1], [2 ** 32, 1], [1.5, 1], [1, Infinity]]) {
    assert.equal(estimator.add(timestamp, now).reason, 'invalid');
    assert.equal(estimator.bpm, 60);
  }
});

test('real Uno peak timestamps give a finite stable estimate', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/uno-beats.json', import.meta.url)));
  const estimator = new TempoEstimator();
  for (const beat of fixture.beats) estimator.add(beat.timestampMs, beat.receiptMs);
  assert.ok(estimator.bpm > 60 && estimator.bpm < 67);
  assert.equal(estimator.status, 'tracking');
});

test('variable slowing in real worn strokes does not leave BPM stuck at the initial fast pace', () => {
  // 2026-10-05 browser capture, 120 BPM cues; actual strokes initially faster.
  const timestamps = [328596, 328966, 329456, 329826, 330236, 330667,
    331096, 331666, 332216, 332676, 333246, 333746, 334186];
  const estimator = new TempoEstimator();
  for (const timestamp of timestamps) estimator.add(timestamp, timestamp - timestamps[0] + 150);
  // Last five measured intervals have median 500 ms (120 BPM).
  assert.ok(Math.abs(estimator.bpm - 120) < 8, `final BPM ${estimator.bpm}`);
  assert.equal(estimator.status, 'tracking');
});
