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

const ROLL_MS = 3000;

// Contact frames (as fraction of ROLL_MS) and their relative impact strength.
const IMPACTS: { at: number; strength: number }[] = [
  { at: 0.30, strength: 1.0 },  // main landing
  { at: 0.70, strength: 0.5 },  // second bounce
  { at: 0.84, strength: 0.2 },  // settle tap
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

// Right-handed Western die. Opposite faces sum to 7; 1-2-3 counterclockwise about a vertex.
const FACE_TRANSFORMS: { face: Face; transform: string }[] = [
  { face: 1, transform: "rotateY(0deg)   translateZ(28px)" }, // front
  { face: 6, transform: "rotateY(180deg) translateZ(28px)" }, // back
  { face: 4, transform: "rotateY(-90deg) translateZ(28px)" }, // left
  { face: 3, transform: "rotateY(90deg)  translateZ(28px)" }, // right
  { face: 2, transform: "rotateX(90deg)  translateZ(28px)" }, // top
  { face: 5, transform: "rotateX(-90deg) translateZ(28px)" }, // bottom
];

// Rotation to bring each face to the camera. Consistent with FACE_TRANSFORMS.
const BASE_ANGLES: Record<Face, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  4: [0, 90],
  3: [0, -90],
  2: [-90, 0],
  5: [90, 0],
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

// Short woody "tok" — filtered noise burst + low body, scaled by strength.
function playClack(strength: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;
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

  const processedRollKeyRef = useRef("");
  const isFirstLoad = useRef(true);
  const onRollCompleteRef = useRef(onRollComplete);
  const onImpactRef = useRef(onImpact);
  const feedbackRef = useRef(feedback);

  const prevTargetX = useRef(0);
  const prevTargetY = useRef(0);

  const animatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    onRollCompleteRef.current = onRollComplete;
    onImpactRef.current = onImpact;
    feedbackRef.current = feedback;
  }, [onRollComplete, onImpact, feedback]);

  const isBusy = disabled || rolling;

  const clearAllTimers = () => {
    if (animatingTimeoutRef.current) clearTimeout(animatingTimeoutRef.current);
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    impactTimeoutsRef.current.forEach(clearTimeout);
    impactTimeoutsRef.current = [];
  };

  const fireImpact = (strength: number) => {
    onImpactRef.current?.(strength);
    if (feedbackRef.current) {
      playClack(strength);
      vibrate(strength);
    }
  };

  useEffect(() => {
    if (!lastDice) return;

    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      processedRollKeyRef.current = rollKey || "";
      const [bx, by] = BASE_ANGLES[lastDice];
      prevTargetX.current = bx;
      prevTargetY.current = by;
      setRotations({ x: bx, y: by });
      return;
    }

    if (!rollKey || processedRollKeyRef.current === rollKey) return;
    processedRollKeyRef.current = rollKey;

    const [tx, ty] = BASE_ANGLES[lastDice];

    if (prefersReducedMotion()) {
      prevTargetX.current = tx;
      prevTargetY.current = ty;
      setIsAnimating(false);
      setRollZ(0);
      setWobble({ x: 0, y: 0 });
      setRotations({ x: tx, y: ty });
      onRollCompleteRef.current?.();
      return;
    }

    setRolling(true);
    setWobble({ x: 0, y: 0 });

    setIsAnimating(false);
    clearAllTimers();
    animatingTimeoutRef.current = setTimeout(() => setIsAnimating(true), 20);

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
      setWobble({ x: 0, y: 0 }); // settle perfectly flat at rest
      onRollCompleteRef.current?.();
    }, ROLL_MS);
  }, [rollKey, lastDice]);

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
    getAudioCtx(); // unlock audio on the user gesture
    try {
      await onRoll();
    } catch {
      clearAllTimers();
      setRolling(false);
      setIsAnimating(false);
      setWobble({ x: 0, y: 0 });
    }
  };

  return (
    <>
      <style>{`
        @keyframes throw-and-bounce {
          0%   { transform: translateY(-120px) rotateZ(-12deg) scale(1.15); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          30%  { transform: translateY(0px) rotateZ(3deg) scale(1); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          52%  { transform: translateY(-22px) rotateZ(-2deg); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          70%  { transform: translateY(0px) rotateZ(0deg); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          84%  { transform: translateY(-5px); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          100% { transform: translateY(0px); }
        }
        .bouncing-dice { animation: throw-and-bounce ${ROLL_MS}ms forwards; }
        @keyframes impact-tilt {
          0%   { transform: rotateZ(-8deg); }
          28%  { transform: rotateZ(2deg); }
          100% { transform: rotateZ(0deg); }
        }
        .dice-tilt { animation: impact-tilt ${ROLL_MS}ms forwards; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            perspective: 300,
            opacity: disabled && !rolling ? 0.5 : 1,
            transition: "opacity 0.2s, filter 0.25s ease-out",
            filter: rolling
              ? "drop-shadow(0 0 18px rgba(35, 165, 89, 0.8)) drop-shadow(0 0 6px rgba(35, 165, 89, 0.4))"
              : "drop-shadow(0 3px 6px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(245, 158, 11, 0.25))",
          }}
        >
          <div className={isAnimating ? "bouncing-dice" : ""} style={{ width: "100%", height: "100%" }}>
            <div className={isAnimating ? "dice-tilt" : ""} style={{ width: "100%", height: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  position: "relative",
                  transformStyle: "preserve-3d",
                  transform: `translateZ(-28px) rotateX(${rotations.x + wobble.x}deg) rotateY(${rotations.y + wobble.y}deg) rotateZ(${isAnimating ? rollZ : 0}deg)`,
                  // Main spin uses the long settle; the wobble overlay snaps in then eases out via the shorter transition.
                  transition: isAnimating
                    ? `transform ${ROLL_MS}ms cubic-bezier(0.05, 0.7, 0.2, 1.0)`
                    : "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
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

        <button
          className="btn-primary"
          onClick={handleClick}
          disabled={isBusy}
          style={{ minHeight: 44, minWidth: 100 }}
        >
          {rolling ? "Rolling..." : "Roll Dice"}
        </button>
      </div>
    </>
  );
}
