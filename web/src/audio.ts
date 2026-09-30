// One shared Web Audio context for every sound effect in the app (dice
// clacks, Ludo effects). Created lazily on first use, after a user gesture.

let audioCtx: AudioContext | null = null;

export function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx || audioCtx.state === "closed") {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}
