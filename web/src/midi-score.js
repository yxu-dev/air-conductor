import { config } from './config.js';

export function compileScore(midi) {
  const ppq = midi.header?.ppq;
  if (!Number.isInteger(ppq) || ppq <= 0) throw new Error('MIDI 节拍精度无效。');
  const signature = midi.header.timeSignatures?.[0]?.timeSignature ?? [4, 4];
  const [beatsPerBar, denominator] = signature;
  if (![beatsPerBar, denominator].every(value => Number.isInteger(value) && value > 0)) {
    throw new Error('MIDI 拍号无效。');
  }
  const barTicks = ppq * 4 * beatsPerBar / denominator;
  if (!Number.isInteger(barTicks)) throw new Error('MIDI 拍号无法按整数 tick 排程。');
  const tracks = [];
  for (const [trackIndex, track] of midi.tracks.entries()) {
    if (track.instrument?.percussion) continue;
    const notes = track.notes.filter(note => note.velocity !== 0).map(note => {
      if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
          !Number.isInteger(note.ticks) || note.ticks < 0 ||
          !Number.isInteger(note.durationTicks) || note.durationTicks <= 0 ||
          !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) {
        throw new Error('MIDI 包含无效音符。');
      }
      return { trackIndex, midi: note.midi, startTick: note.ticks,
        endTick: note.ticks + note.durationTicks, velocity: note.velocity };
    }).sort((a, b) => a.midi - b.midi || a.startTick - b.startTick);
    // Merge true same-pitch overlaps within a voice, preserving adjacent reattacks.
    const merged = [];
    for (const note of notes) {
      const previous = merged.at(-1);
      if (previous?.midi === note.midi && note.startTick < previous.endTick) {
        previous.endTick = Math.max(previous.endTick, note.endTick);
        previous.velocity = Math.max(previous.velocity, note.velocity);
      } else merged.push({ ...note });
    }
    if (merged.length) tracks.push({ trackIndex, name: track.name,
      pitches: [...new Set(merged.map(note => note.midi))],
      notes: merged.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi) });
  }
  const notes = tracks.flatMap(track => track.notes);
  if (!notes.length) throw new Error('MIDI 没有可播放的旋律音符。');
  const lastEnd = Math.max(...notes.map(note => note.endTick));
  const durationTicks = Math.max(lastEnd, Number.isFinite(midi.durationTicks) ? midi.durationTicks : 0);
  const loopTicks = Math.ceil(durationTicks / barTicks) * barTicks;
  const groups = new Map();
  const eventAt = tick => {
    if (!groups.has(tick)) groups.set(tick, { tick, attacks: [], releases: [] });
    return groups.get(tick);
  };
  for (const note of notes) {
    eventAt(note.startTick).attacks.push(note);
    // Tone loops before invoking events at loopEnd; the loopEnd handler releases these.
    if (note.endTick < loopTicks) eventAt(note.endTick).releases.push(note);
  }
  return { ppq, beatsPerBar, denominator, barTicks, loopTicks,
    bars: loopTicks / barTicks, tracks, notes,
    initialBpm: midi.header.tempos?.[0]?.bpm ?? config.defaultBpm,
    events: [...groups.values()].sort((a, b) => a.tick - b.tick) };
}

export function heldNotes(score, tick) {
  return score.notes.filter(note => note.startTick < tick && note.endTick > tick);
}
