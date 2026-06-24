import { useState, useEffect, useRef } from "react";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

interface DiceProps {
  onRoll: () => void | Promise<void>;
  disabled: boolean;
  lastDice: Face | null;
  rollKey: string;
  onRollComplete?: () => void;
  /** Fires at each physical contact (bounce) so you can play SFX/haptics. */
  onImpact?: (strength: number) => void;
  /** Master switch for built-in sound + vibration. Defaults to true. */
  feedback?: boolean;
}

const ROLL_MS = 4500;

// Contact frames (as fraction of ROLL_MS) and their relative impact strength.
// NOTE: these now match the translateY(0) touchdowns in the keyframes below.
const IMPACTS: { at: number; strength: number }[] = [
  { at: 0.25, strength: 1.0 }, // main landing
  { at: 0.58, strength: 0.5 }, // second bounce
  { at: 0.85, strength: 0.2 }, // settle tap
];

// Pip positions as [col, row] in a 3x3 grid, authored for the FRONT view.
const PIPS: Record<Face, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
};

// Right-handed Western die. Opposite faces sum to 7; 1-2-3 counterclockwise
// about a vertex. (3 now on the LEFT, 4 on the RIGHT, to fix the chirality.)
const FACE_TRANSFORMS: { face: Face; transform: string }[] = [
  { face: 1, transform: "rotateY(0deg)   translateZ(28px)" }, // front
  { face: 6, transform: "rotateY(180deg) translateZ(28px)" }, // back
  { face: 3, transform: "rotateY(-90deg) translateZ(28px)" }, // left
  { face: 4, transform: "rotateY(90deg)  translateZ(28px)" }, // right
  { face: 2, transform: "rotateX(90deg)  translateZ(28px)" }, // top
  { face: 5, transform: "rotateX(-90deg) translateZ(28px)" }, // bottom
];

// Rotation to bring each face to the camera. Consistent with FACE_TRANSFORMS.
const BASE_ANGLES: Record<Face, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  3: [0, 90],   // left  → swapped with 4
  4: [0, -90],  // right → swapped with 3
  2: [-90, 0],
  5: [90, 0],
};

const reducedMotionQuery = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/* ---------- Built-in feedback (Web Audio + Vibration) ---------- */

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      // resume() is async; swallow the rejection so we never throw on a gesture.
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Short woody "tok" — filtered noise burst + low body, scaled by strength.
function playClack(strength: number) {
  const ctx = getAudioCtx();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const vol = 0.06 + strength * 0.18;
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + strength * 0.08);
  gain.connect(ctx.destination);

  // Noise burst (the "tick")
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800 + strength * 600;
  bp.Q.value = 0.8;
  noise.connect(bp).connect(gain);

  // Low body thud
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220 - strength * 60, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(oscGain).connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 0.06);
  osc.start(now);
  osc.stop(now + 0.12);
}

function vibrate(strength: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(Math.round(8 + strength * 22));
  }
}

/* ---------- Pips ---------- */

const Dot = ({ color = "#2b1d10" }: { color?: string }) => (
  <div
    style={{
      width: 9,
      height: 9,
      borderRadius: "50%",
      backgroundColor: color,
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
      margin: "auto",
    }}
  />
);

function FaceGrid({ face }: { face: Face }) {
  return (
    <>
      {PIPS[face].map(([col, row], i) => (
        <div key={i} style={{ gridColumn: col, gridRow: row, display: "flex" }}>
          <Dot color={face === 1 ? "#e74c3c" : "#2b1d10"} />
        </div>
      ))}
    </>
  );
}

/* ---------- Component ---------- */

export default function Dice({
  onRoll,
  disabled,
  lastDice,
  rollKey,
  onRollComplete,
  onImpact,
  feedback = true,
}: DiceProps) {
  const [rotations, setRotations] = useState({ x: 0, y: 0 });
  const [rollZ, setRollZ] = useState(0);
  const [wobble, setWobble] = useState({ x: 0, y: 0 }); // micro settle offset
  const [isAnimating, setIsAnimating] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [pending, setPending] = useState(false); // guards the await window

  // reactive reduced-motion flag
  const [reducedMotion, setReducedMotion] = useState<boolean>(
    () => reducedMotionQuery()?.matches ?? false
  );

  const processedRollKeyRef = useRef("");
  const didInitRef = useRef(false);

  const onRollCompleteRef = useRef(onRollComplete);
  const onImpactRef = useRef(onImpact);
  const feedbackRef = useRef(feedback);

  const prevTargetX = useRef(0);
  const prevTargetY = useRef(0);

  // Element we restart the bounce keyframes on (no React remount → keeps the
  // inner cube's transform transition alive).
  const bounceRef = useRef<HTMLDivElement>(null);

  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    onRollCompleteRef.current = onRollComplete;
    onImpactRef.current = onImpact;
    feedbackRef.current = feedback;
  }, [onRollComplete, onImpact, feedback]);

  // Keep reduced-motion preference reactive.
  useEffect(() => {
    const mql = reducedMotionQuery();
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);

  const isBusy = disabled || rolling || pending;

  const clearAllTimers = () => {
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    impactTimeoutsRef.current.forEach(clearTimeout);
    impactTimeoutsRef.current = [];
  };

  const scheduleSettle = () => {
    setSettled(true);
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = setTimeout(() => setSettled(false), 1200);
  };

  const restartBounce = () => {
    const el = bounceRef.current;
    if (!el) return;
    el.classList.remove("bouncing-dice");
    void el.offsetWidth; // force reflow to restart the keyframes
    el.classList.add("bouncing-dice");
  };

  const fireImpact = (strength: number) => {
    onImpactRef.current?.(strength);
    if (feedbackRef.current) {
      playClack(strength);
      vibrate(strength);
    }
  };

  // Run once on mount: only snap + mark processed if we joined MID-GAME.
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    if (lastDice != null) {
      const [bx, by] = BASE_ANGLES[lastDice];
      prevTargetX.current = bx;
      prevTargetY.current = by;
      setRotations({ x: bx, y: by });
      processedRollKeyRef.current = rollKey || "";
    }
  }, []); // eslint-disable-line

  // Handle rolling animation
  useEffect(() => {
    if (lastDice == null) return;
    if (!rollKey || processedRollKeyRef.current === rollKey) return;

    processedRollKeyRef.current = rollKey;

    const [tx, ty] = BASE_ANGLES[lastDice];

    if (reducedMotion) {
      clearAllTimers();
      prevTargetX.current = tx;
      prevTargetY.current = ty;
      setIsAnimating(false);
      setRolling(false);
      setRollZ(0);
      setWobble({ x: 0, y: 0 });
      setRotations({ x: tx, y: ty });
      scheduleSettle();
      onRollCompleteRef.current?.();
      return;
    }

    setRolling(true);
    setSettled(false);
    setWobble({ x: 0, y: 0 });

    clearAllTimers();
    setIsAnimating(true);
    restartBounce();

    setRotations((prev) => {
      const baseX = Math.round((prev.x - prevTargetX.current) / 360) * 360;
      const baseY = Math.round((prev.y - prevTargetY.current) / 360) * 360;
      const spinX = (Math.floor(Math.random() * 4) + 6) * 360 * (Math.random() < 0.5 ? -1 : 1);
      const spinY = (Math.floor(Math.random() * 5) + 7) * 360 * (Math.random() < 0.5 ? -1 : 1);
      prevTargetX.current = tx;
      prevTargetY.current = ty;
      return { x: baseX + spinX + tx, y: baseY + spinY + ty };
    });

    const zSpin = (Math.floor(Math.random() * 4) + 3) * 360 * (Math.random() < 0.5 ? -1 : 1);
    setRollZ(zSpin);

    // Schedule impact feedback at each contact frame.
    impactTimeoutsRef.current = IMPACTS.map(({ at, strength }) =>
      setTimeout(() => {
        fireImpact(strength);
        // Realistic wobble: a small random secondary tilt that decays per bounce.
        const amp = 4 * strength;
        setWobble({
          x: (Math.random() * 2 - 1) * amp,
          y: (Math.random() * 2 - 1) * amp,
        });
      }, ROLL_MS * at)
    );

    finishTimeoutRef.current = setTimeout(() => {
      setRolling(false);
      setIsAnimating(false);
      setRollZ(0);
      setWobble({ x: 0, y: 0 });
      scheduleSettle();
      onRollCompleteRef.current?.();
    }, ROLL_MS);
  }, [rollKey, lastDice, reducedMotion]);

  useEffect(() => clearAllTimers, []);

  const faceStyle: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: "#f5ede0",
    border: "1px solid #c4a882",
    borderRadius: 8,
    boxShadow: "inset 0 0 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4)",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "repeat(3, 1fr)",
    padding: 6,
    backfaceVisibility: "hidden",
  };

  const handleClick = async () => {
    if (isBusy) return;
    setPending(true);
    getAudioCtx(); // unlock audio on the user gesture
    try {
      await onRoll();
    } catch {
      clearAllTimers();
      setRolling(false);
      setIsAnimating(false);
      setWobble({ x: 0, y: 0 });
      setSettled(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes throw-and-bounce {
          0%   { transform: translateY(-160px) rotateZ(-18deg) scale(1.2); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          25%  { transform: translateY(0px) rotateZ(4deg) scale(1); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          40%  { transform: translateY(-40px) rotateZ(-3deg); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          58%  { transform: translateY(0px) rotateZ(2deg); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          72%  { transform: translateY(-18px) rotateZ(-1deg); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          85%  { transform: translateY(0px) rotateZ(0deg); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          93%  { transform: translateY(-6px); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          100% { transform: translateY(0px); }
        }
        .bouncing-dice { animation: throw-and-bounce ${ROLL_MS}ms forwards; }
        @keyframes impact-tilt {
          0%   { transform: rotateZ(-8deg); }
          28%  { transform: rotateZ(2deg); }
          100% { transform: rotateZ(0deg); }
        }
        .dice-tilt { animation: impact-tilt ${ROLL_MS}ms forwards; }

        @keyframes settle-glow {
          0%   { filter: drop-shadow(0 0 24px rgba(245, 158, 11, 1.0)) drop-shadow(0 0 8px rgba(255,255,255,0.8)); }
          100% { filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(245, 158, 11, 0.25)); }
        }
        .settled-dice { animation: settle-glow 1.2s ease-out forwards; }

        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
        }
      `}</style>

      {/* Screen-reader announcement of the latest result */}
      <span className="sr-only" aria-live="polite">
        {!rolling && lastDice != null ? `Rolled a ${lastDice}` : ""}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          className={settled ? "settled-dice" : ""}
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            perspective: 300,
            opacity: disabled && !rolling && !settled ? 0.5 : 1,
            transition: "opacity 0.4s ease-out, filter 0.4s ease-out",
            filter: rolling
              ? "drop-shadow(0 0 24px rgba(35, 165, 89, 1.0)) drop-shadow(0 0 12px rgba(35, 165, 89, 0.8)) drop-shadow(0 0 4px rgba(255,255,255,0.6))"
              : "drop-shadow(0 3px 6px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(245, 158, 11, 0.25))",
          }}
        >
          {/* Bounce layer — keyframes restarted imperatively, NOT remounted */}
          <div ref={bounceRef} style={{ width: "100%", height: "100%" }}>
            <div className={isAnimating ? "dice-tilt" : ""} style={{ width: "100%", height: "100%" }}>
              {/* Wobble Wrapper */}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  transformStyle: "preserve-3d",
                  transform: `rotateX(${wobble.x}deg) rotateY(${wobble.y}deg)`,
                  transition: "transform 0.15s ease-out",
                }}
              >
                {/* Main Transform Inner Cube (persistent → transition animates) */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    transformStyle: "preserve-3d",
                    transform: `translateZ(-28px) rotateX(${rotations.x}deg) rotateY(${rotations.y}deg) rotateZ(${isAnimating ? rollZ : 0}deg)`,
                    transition: isAnimating
                      ? `transform ${ROLL_MS}ms cubic-bezier(0.05, 0.7, 0.2, 1.0)`
                      : "transform 0.8s cubic-bezier(0.22, 1.0, 0.36, 1)",
                    willChange: "transform",
                  }}
                >
                  {FACE_TRANSFORMS.map(({ face, transform }) => (
                    <div key={face} style={{ ...faceStyle, transform }}>
                      <FaceGrid face={face} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={handleClick}
          disabled={isBusy}
          aria-label="Roll the dice"
          aria-busy={rolling || pending}
          style={{ minHeight: 44, minWidth: 100 }}
        >
          {rolling ? "Rolling..." : "Roll Dice"}
        </button>
      </div>
    </>
  );
}
