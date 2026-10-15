// Local synthesis only. Every palette plays the same upper/lower MIDI tracks.
const envelope = (attack, decay, sustain, release) => ({ attack, decay, sustain, release });
const filter = frequency => ({ type: 'lowpass', frequency, Q: .6 });
const filterEnvelope = (baseFrequency, octaves, attack, decay, sustain, release) =>
  ({ baseFrequency, octaves, attack, decay, sustain, release });
const expression = (base, beatAccent, phraseSwell) => ({ base, beatAccent, phraseSwell });
const effects = (chorusWet, delayWet) => ({ chorusWet, delayWet });
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const soundProfiles = freeze({
  ensemble: {
    label: 'Ensemble', description: 'Warm synthetic lead with a soft supporting voice.', effects: effects(0, .02),
    tracks: [
      { voice: 'Synth', maxPolyphony: 32, volume: -3, cutoff: 1800,
        options: { oscillator: { type: 'custom', partials: [1, .28, .16, .05, .035, .018] }, envelope: envelope(.025, .16, .42, .06) } },
      { voice: 'Synth', maxPolyphony: 32, volume: -9, cutoff: 3200,
        options: { oscillator: { type: 'custom', partials: [1, .08, .28, .035, .07] }, envelope: envelope(.007, .28, .22, .065) } },
    ],
  },
  chamber: {
    label: 'Chamber Strings', description: 'Synthetic violin-like lead and cello-like accompaniment, with gentle vibrato.', effects: effects(.035, .015),
    tracks: [
      { voice: 'DuoSynth', maxPolyphony: 16, volume: -3, cutoff: 2800,
        options: { vibratoRate: 5.1, vibratoAmount: .055, harmonicity: 1.003,
          voice0: { volume: -2, oscillator: { type: 'sawtooth' }, filter: filter(2800),
            filterEnvelope: filterEnvelope(360, 2.7, .025, .2, .55, .16), envelope: envelope(.035, .17, .7, .20) },
          voice1: { volume: -10, oscillator: { type: 'triangle' }, filter: filter(2200),
            filterEnvelope: filterEnvelope(300, 2.2, .05, .2, .6, .19), envelope: envelope(.052, .2, .64, .20) } },
        expression: expression(.82, .035, .035) },
      { voice: 'MonoSynth', maxPolyphony: 16, volume: -12, cutoff: 1500,
        options: { oscillator: { type: 'sawtooth' }, filter: filter(1800),
          filterEnvelope: filterEnvelope(150, 2.4, .045, .27, .58, .2), envelope: envelope(.06, .23, .72, .22) },
        expression: expression(.66, .015, .025) },
    ],
  },
  woodwinds: {
    label: 'Woodwinds', description: 'Soft synthetic flute-like melody with warm bassoon-like support.', effects: effects(.012, .008),
    tracks: [
      { voice: 'DuoSynth', maxPolyphony: 16, volume: -3, cutoff: 4000,
        options: { vibratoRate: 4.8, vibratoAmount: .016, harmonicity: 1,
          voice0: { volume: -2, oscillator: { type: 'sine' }, filter: filter(3800),
            filterEnvelope: filterEnvelope(550, 2.3, .02, .1, .8, .12), envelope: envelope(.022, .13, .77, .12) },
          voice1: { volume: -16, oscillator: { type: 'triangle' }, filter: filter(3000),
            filterEnvelope: filterEnvelope(500, 1.5, .03, .15, .7, .12), envelope: envelope(.03, .14, .65, .12) } },
        expression: expression(.83, .02, .025) },
      { voice: 'MonoSynth', maxPolyphony: 16, volume: -13, cutoff: 1500,
        options: { oscillator: { type: 'custom', partials: [1, .33, .13, .055, .02] }, filter: filter(1700),
          filterEnvelope: filterEnvelope(210, 2.1, .027, .23, .64, .13), envelope: envelope(.034, .2, .64, .15) },
        expression: expression(.64, .015, .025) },
    ],
  },
  keys: {
    label: 'Soft Keys', description: 'Synthetic electric-piano-like tones with a clear attack and a gentle sustain.', effects: effects(.015, .02),
    tracks: [
      { voice: 'FMSynth', maxPolyphony: 16, volume: 6, cutoff: 6400,
        options: { harmonicity: 3, modulationIndex: 2.2, oscillator: { type: 'sine' }, modulation: { type: 'sine' },
          envelope: envelope(.005, .45, .22, .18), modulationEnvelope: envelope(.003, .12, .03, .12) },
        expression: expression(.82, .035, .03) },
      { voice: 'FMSynth', maxPolyphony: 16, volume: -3, cutoff: 4800,
        options: { harmonicity: 2, modulationIndex: 1.15, oscillator: { type: 'sine' }, modulation: { type: 'sine' },
          envelope: envelope(.009, .53, .34, .2), modulationEnvelope: envelope(.006, .20, .07, .15) },
        expression: expression(.63, .018, .018) },
    ],
  },
  classic: {
    label: 'Classic', description: 'The original two electronic triangle voices.', effects: effects(0, 0),
    tracks: [0, 1].map(() => ({ voice: 'Synth', maxPolyphony: 32, volume: 0, cutoff: 20000, bypassFilter: true,
      options: { oscillator: { type: 'triangle' }, envelope: envelope(.01, .12, .4, .035) } })),
  },
});

export function soundSettings(profile) {
  if (!Object.hasOwn(soundProfiles, profile)) throw new Error('Unknown sound palette.');
  return soundProfiles[profile];
}
export function trackSound(profile, index) {
  const tracks = soundSettings(profile).tracks;
  if (!Number.isInteger(index) || index < 0 || index >= tracks.length) throw new Error('Invalid melodic-track index.');
  return tracks[index];
}
export function performedVelocity(note, score, spec) {
  const expr = spec.expression;
  if (!expr) return note.velocity;
  const beatTicks = score.ppq * 4 / score.denominator;
  const accent = Math.floor((note.startTick % score.barTicks) / beatTicks) === 0 ? expr.beatAccent : 0;
  const phase = (note.startTick % (score.barTicks * 4)) / (score.barTicks * 4);
  return Math.min(.98, Math.max(0, note.velocity * (expr.base + accent + expr.phraseSwell * Math.sin(Math.PI * phase))));
}
