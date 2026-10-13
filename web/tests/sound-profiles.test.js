import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { soundProfiles, trackSound, performedVelocity } from '../src/sound-profiles.js';

test('the original MIDI remains byte-for-byte unchanged', () => {
  const midi = readFileSync(new URL('../public/midi/ode.mid', import.meta.url));
  assert.equal(createHash('sha256').update(midi).digest('hex'), 'fb1604c08c865b275b464d74e5a7c526ff1a8acccdf9853cb92f0778daaed14b');
});

test('expression is deterministic, retains source velocity and works with eighth-note beats', () => {
  const score = { ppq: 384, denominator: 8, barTicks: 1152 };
  const strong = { startTick: 0, velocity: .8 }, weak = { startTick: 192, velocity: .8 };
  const spec = trackSound('chamber', 0);
  assert.equal(performedVelocity(strong, score, spec), performedVelocity({ ...strong }, score, spec));
  assert.ok(performedVelocity(strong, score, spec) > performedVelocity(weak, score, spec));
  assert.equal(performedVelocity({ ...strong, velocity: 0 }, score, spec), 0);
  for (const profile of ['classic', 'ensemble']) assert.equal(performedVelocity(strong, score, trackSound(profile, 0)), .8);
  assert.ok(Object.isFrozen(soundProfiles.chamber.tracks[0].options.voice0));
  assert.throws(() => trackSound('chamber', 2), /Invalid melodic/);
});
