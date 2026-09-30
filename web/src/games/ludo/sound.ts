// Small synthesized sound effects for Ludo. Nothing is downloaded; every
// sound is a few oscillator notes on the app's shared audio context.
import { getAudioCtx } from "../../audio";

export type LudoSound = "step" | "exit" | "capture" | "home" | "extra" | "turn" | "tick" | "victory" | "bad";

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; vol?: number; slideTo?: number };

const SOUNDS: Record<LudoSound, Note[]> = {
  step: [{ freq: 740, at: 0, dur: 0.05, type: "sine", vol: 0.05 }],
  exit: [{ freq: 330, at: 0, dur: 0.16, type: "triangle", vol: 0.12, slideTo: 660 }],
  capture: [
    { freq: 520, at: 0, dur: 0.22, type: "sawtooth", vol: 0.06, slideTo: 130 },
    { freq: 110, at: 0.18, dur: 0.18, type: "triangle", vol: 0.16 },
  ],
  home: [
    { freq: 523, at: 0, dur: 0.14, type: "triangle", vol: 0.1 },
    { freq: 659, at: 0.1, dur: 0.14, type: "triangle", vol: 0.1 },
    { freq: 784, at: 0.2, dur: 0.24, type: "triangle", vol: 0.1 },
  ],
  extra: [
    { freq: 880, at: 0, dur: 0.1, type: "sine", vol: 0.08 },
    { freq: 1175, at: 0.09, dur: 0.16, type: "sine", vol: 0.08 },
  ],
  turn: [
    { freq: 587, at: 0, dur: 0.14, type: "sine", vol: 0.09 },
    { freq: 880, at: 0.12, dur: 0.22, type: "sine", vol: 0.09 },
  ],
  tick: [{ freq: 1320, at: 0, dur: 0.035, type: "square", vol: 0.025 }],
  bad: [{ freq: 300, at: 0, dur: 0.3, type: "triangle", vol: 0.1, slideTo: 150 }],
  victory: [
    { freq: 523, at: 0, dur: 0.16, type: "triangle", vol: 0.11 },
    { freq: 659, at: 0.14, dur: 0.16, type: "triangle", vol: 0.11 },
    { freq: 784, at: 0.28, dur: 0.16, type: "triangle", vol: 0.11 },
    { freq: 1047, at: 0.42, dur: 0.5, type: "triangle", vol: 0.12 },
  ],
};

export function playLudoSound(name: LudoSound) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const n of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + n.at;
      osc.type = n.type ?? "sine";
      osc.frequency.setValueAtTime(n.freq, start);
      if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, start + n.dur);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(n.vol ?? 0.08, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + n.dur + 0.02);
    }
  } catch {
    // Sound is best-effort
  }
}

const SOUND_KEY = "ludo:sound";

export function loadSoundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundPreference(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Private mode: the preference just won't persist
  }
}
