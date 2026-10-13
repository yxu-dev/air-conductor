// Both palettes play the same MIDI tracks. No samples or external audio assets.
export const soundProfiles = Object.freeze({
  ensemble: Object.freeze({ label: 'Ensemble', ambience: .08 }),
  classic: Object.freeze({ label: 'Classic', ambience: 0 }),
});

export function soundSettings(profile) {
  if (!Object.hasOwn(soundProfiles, profile)) throw new Error('Unknown sound palette.');
  return soundProfiles[profile];
}

export function trackSound(profile, index) {
  soundSettings(profile);
  if (profile === 'classic') return {
    volume: 0, cutoff: 20000,
    oscillator: { type: 'triangle' },
    envelope: { attack: .01, decay: .12, sustain: .4, release: .035 },
  };
  return index % 2 === 0 ? {
    volume: -3, cutoff: 2600,
    // Stay in the same oscillator family so live switches retain active voices.
    oscillator: { type: 'sawtooth8' },
    envelope: { attack: .035, decay: .18, sustain: .5, release: .09 },
  } : {
    volume: 0, cutoff: 4200,
    oscillator: { type: 'custom', partials: [1, .12, .35, .04, .09] },
    envelope: { attack: .007, decay: .28, sustain: .3, release: .09 },
  };
}
