import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionTrail } from '../src/motion-stage.js';

const hand = () => ({ cameraReady: true, leftHandBound: true, handTracked: true, experienceMode: 'conduct', cameraFrames: 1, palmX: .2, palmY: .7 });
test('motion trails mirror confirmed samples and never duplicate an inference frame', () => {
  const trail = new MotionTrail(), state = hand();
  trail.sample(state, 0); trail.sample(state, 40);
  assert.equal(trail.points.length, 1); assert.equal(trail.points[0].x, .8);
  state.cameraFrames++; state.palmY = .6; trail.sample(state, 50);
  assert.equal(trail.points.length, 2); assert.equal(trail.points[1].y, .6);
});
test('trails break across lost hands and stalled frames, then expire completely', () => {
  const trail = new MotionTrail(), state = hand(); trail.sample(state, 0);
  state.handTracked = false; trail.sample(state, 50);
  state.handTracked = true; state.cameraFrames++; trail.sample(state, 100);
  assert.notEqual(trail.points[0].segment, trail.points[1].segment);
  state.cameraFrames++; trail.sample(state, 500);
  assert.notEqual(trail.points[1].segment, trail.points[2].segment);
  state.handTracked = false; trail.sample(state, 1600);
  assert.equal(trail.points.length, 0);
});
test('unconfirmed and manual hands cannot draw trails; invalid coordinates are rejected', () => {
  const trail = new MotionTrail(), state = hand();
  state.leftHandBound = false; trail.sample(state, 0);
  state.leftHandBound = true; state.experienceMode = 'manual'; state.cameraFrames++; trail.sample(state, 50);
  state.experienceMode = 'conduct'; state.cameraFrames++; state.palmX = NaN; trail.sample(state, 100);
  assert.equal(trail.points.length, 0);
});
