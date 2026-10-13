// Both palettes play the same MIDI tracks. No samples or external audio assets.
export const soundProfiles = Object.freeze({
  ensemble: Object.freeze({ label: 'Ensemble', ambience: .02 }),
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
    volume: -3, cutoff: 1800,
    // Gentle upper harmonics soften the lead without changing oscillator family.
    oscillator: { type: 'custom', partials: [1, .28, .16, .05, .035, .018] },
    envelope: { attack: .025, decay: .16, sustain: .42, release: .06 },
  } : {
    volume: -9, cutoff: 3200,
    oscillator: { type: 'custom', partials: [1, .08, .28, .035, .07] },
    envelope: { attack: .007, decay: .28, sustain: .22, release: .065 },
  };
}
