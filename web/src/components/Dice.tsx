import { useState, useEffect, useRef } from "react";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

interface DiceProps {
  onRoll: () => void | Promise<void>;
  disabled: boolean;
  lastDice: Face | null;
  rollKey: string;
  onRollComplete?: () => void;
  onImpact?: (strength: number) => void;
  feedback?: boolean;
}

const ROLL_MS = 4500;

// BUG FIX (pieces appear to move while the dice is still visually settling):
// `onRollComplete` previously fired in the exact same tick the CSS roll
// animation's *duration* elapsed. A cubic-bezier-eased animation's final
// frames are its slowest and most visually prominent — the dice is still
// perceptibly settling for a beat after the animation's clock technically
// finishes. SETTLE_BUFFER_MS adds a small, deliberate cushion between "the
// roll animation's timer fired" and "tell the rest of the app it's safe to
// start moving pieces," so the token never starts walking while the dice
// still visually reads as in motion.
const SETTLE_BUFFER_MS = 250;

// Physics impacts mapped to animation keyframes
const IMPACTS: { at: number; strength: number }[] = [
  { at: 0.25, strength: 1.0 },
  { at: 0.58, strength: 0.5 },
  { at: 0.85, strength: 0.2 },
  { at: 0.97, strength: 0.08 },
];

const PIPS: Record<Face, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
};

const FACE_TRANSFORMS: { face: Face; transform: string }[] = [
  { face: 1, transform: "rotateY(0deg)   translateZ(28px)" },
  { face: 6, transform: "rotateY(180deg) translateZ(28px)" },
  { face: 3, transform: "rotateY(-90deg) translateZ(28px)" },
  { face: 4, transform: "rotateY(90deg)  translateZ(28px)" },
  { face: 2, transform: "rotateX(90deg)  translateZ(28px)" },
  { face: 5, transform: "rotateX(-90deg) translateZ(28px)" },
];

const BASE_ANGLES: Record<Face, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  3: [0, 90],
  4: [0, -90],
  2: [-90, 0],
  5: [90, 0],
};

const reducedMotionQuery = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/* ---------- Audio Engine ---------- */

let audioCtx: AudioContext | null = null;
let noiseBufferCache: AudioBuffer | null = null;

function getAudioCtx(): AudioContext | null {
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

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBufferCache) {
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noiseBufferCache = buffer;
  }
  return noiseBufferCache;
}

function playClack(strength: number) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return; 

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const vol = 0.06 + strength * 0.22;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + strength * 0.08);
    gain.connect(ctx.destination);

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800 + strength * 800;
    bp.Q.value = 0.9;
    noise.connect(bp).connect(gain);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240 - strength * 80, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(oscGain).connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.06);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    // Audio is best-effort
  }
}

function vibrate(strength: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(Math.round(8 + strength * 24));
  }
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
}: DiceProps): React.JSX.Element {
  const [rotations, setRotations] = useState({ x: 0, y: 0 });
  const [rollZ, setRollZ] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [pending, setPending] = useState(false);

  const [reducedMotion, setReducedMotion] = useState<boolean>(
    () => reducedMotionQuery()?.matches ?? false
  );

  const processedRollKeyRef = useRef("");

  const onRollCompleteRef = useRef(onRollComplete);
  const onImpactRef = useRef(onImpact);
  const feedbackRef = useRef(feedback);

  const wobbleRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  const currentRotRef = useRef({ x: 0, y: 0 });
  const prevTargetX = useRef(0);
  const prevTargetY = useRef(0);
  const currentZRef = useRef(0);

  const bounceRef = useRef<HTMLDivElement>(null);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleBufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wobbleRafRef = useRef<number | null>(null);

  useEffect(() => {
    onRollCompleteRef.current = onRollComplete;
    onImpactRef.current = onImpact;
    feedbackRef.current = feedback;
  }, [onRollComplete, onImpact, feedback]);

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
    if (settleBufferTimeoutRef.current) clearTimeout(settleBufferTimeoutRef.current);
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    impactTimeoutsRef.current.forEach(clearTimeout);
    impactTimeoutsRef.current = [];
    if (wobbleRafRef.current !== null) {
      cancelAnimationFrame(wobbleRafRef.current);
      wobbleRafRef.current = null;
    }
  };

  const scheduleSettle = () => {
    if (reducedMotion) return; 

    setSettled(false);
    requestAnimationFrame(() => setSettled(true));
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = setTimeout(() => setSettled(false), 1200);
  };

  const restartBounce = () => {
    const el = bounceRef.current;
    const shadow = shadowRef.current;
    
    el?.scrollIntoView({ block: "center", behavior: "instant" });

    if (el) {
      el.classList.remove("bouncing-dice");
      void el.offsetWidth; 
      el.classList.add("bouncing-dice");
    }
    if (shadow) {
      shadow.classList.remove("physics-shadow");
      void shadow.offsetWidth;
      shadow.classList.add("physics-shadow");
    }
  };

  // ★ PERFORMANCE FIX: Use performance.now() and force translateZ(0) for composite layer segregation
  const applyDampedWobble = (strength: number) => {
    const el = wobbleRef.current;
    if (!el) return;

    if (wobbleRafRef.current !== null) {
      cancelAnimationFrame(wobbleRafRef.current);
      wobbleRafRef.current = null;
    }

    const amp = 6 * strength;
    const gamma = 4; 
    const omega = 18; 

    let start: number | null = null;
    const animateWobble = () => {
      const now = performance.now(); // High precision timestamp
      if (start === null) start = now;
      const t = now - start;
      const decay = Math.exp(-gamma * (t / 1000));
      const offset = amp * decay * Math.cos(omega * (t / 1000));

      if (Math.abs(offset) < 0.1) {
        // translateZ(0px) explicitly forces mobile browsers to keep this on the GPU
        el.style.transform = "rotateX(0deg) rotateY(0deg) translateZ(0px)"; 
        wobbleRafRef.current = null;
        return;
      }
      el.style.transform = `rotateX(${offset}deg) rotateY(${offset * 0.5}deg) translateZ(0px)`;
      wobbleRafRef.current = requestAnimationFrame(animateWobble);
    };
    wobbleRafRef.current = requestAnimationFrame(animateWobble);
  };

  const fireImpact = (strength: number) => {
    onImpactRef.current?.(strength);
    if (feedbackRef.current) {
      playClack(strength);
      vibrate(strength);
    }
  };

  useEffect(() => {
    if (lastDice != null && currentRotRef.current.x === 0 && currentRotRef.current.y === 0) {
      const [bx, by] = BASE_ANGLES[lastDice];
      prevTargetX.current = bx;
      prevTargetY.current = by;
      currentRotRef.current = { x: bx, y: by };
      setRotations({ x: bx, y: by });
      processedRollKeyRef.current = rollKey || "";
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (lastDice == null) return;
    if (!rollKey || processedRollKeyRef.current === rollKey) return;

    processedRollKeyRef.current = rollKey;

    const [tx, ty] = BASE_ANGLES[lastDice];

    if (reducedMotion) {
      clearAllTimers();

      const baseX = Math.round((currentRotRef.current.x - prevTargetX.current) / 360) * 360;
      const baseY = Math.round((currentRotRef.current.y - prevTargetY.current) / 360) * 360;
      const newX = baseX + tx;
      const newY = baseY + ty;

      prevTargetX.current = tx;
      prevTargetY.current = ty;
      currentRotRef.current = { x: newX, y: newY };

      setIsAnimating(false);
      setRolling(false);
      setRotations({ x: newX, y: newY });
      scheduleSettle();
      // Reduced motion still gets a (much smaller) buffer for consistency,
      // even though there's effectively no animation to wait out.
      settleBufferTimeoutRef.current = setTimeout(() => {
        onRollCompleteRef.current?.();
      }, 50);
      return;
    }

    setRolling(true);
    setSettled(false);

    clearAllTimers();
    setIsAnimating(true);
    restartBounce();

    const prevX = currentRotRef.current.x;
    const prevY = currentRotRef.current.y;

    const baseX = Math.round((prevX - prevTargetX.current) / 360) * 360;
    const baseY = Math.round((prevY - prevTargetY.current) / 360) * 360;

    const spinX = (Math.floor(Math.random() * 4) + 5) * 360 * (Math.random() < 0.5 ? -1 : 1);
    const spinY = (Math.floor(Math.random() * 5) + 6) * 360 * (Math.random() < 0.5 ? -1 : 1);

    const newX = baseX + spinX + tx;
    const newY = baseY + spinY + ty;

    prevTargetX.current = tx;
    prevTargetY.current = ty;
    currentRotRef.current = { x: newX, y: newY };

    setRotations({ x: newX, y: newY });

    const zSpin = (Math.floor(Math.random() * 4) + 3) * 360 * (Math.random() < 0.5 ? -1 : 1);
    const newZ = currentZRef.current + zSpin;
    currentZRef.current = newZ;
    setRollZ(newZ);

    impactTimeoutsRef.current = IMPACTS.map(({ at, strength }) =>
      setTimeout(() => {
        fireImpact(strength);
        applyDampedWobble(strength);
      }, ROLL_MS * at)
    );

    // BUG FIX: `onRollComplete` no longer fires in the same tick the roll
    // animation's clock elapses. We wait ROLL_MS for the animation itself,
    // then an additional SETTLE_BUFFER_MS before telling the rest of the
    // app it's safe to act on the result (e.g. start moving a token). This
    // closes the gap where a token could start walking during the dice's
    // final, slowest (eased-out) bounce frames — the part of the motion
    // most likely to still read as "rolling" to the human eye even though
    // the animation's timer has technically finished.
    finishTimeoutRef.current = setTimeout(() => {
      setRolling(false);
      setIsAnimating(false);
      scheduleSettle();

      settleBufferTimeoutRef.current = setTimeout(() => {
        onRollCompleteRef.current?.();
      }, SETTLE_BUFFER_MS);
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
    getAudioCtx(); 
    try {
      await onRoll();
    } catch {
      clearAllTimers();
      setRolling(false);
      setIsAnimating(false);
      setSettled(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes throw-and-bounce {
          0%   { transform: translateY(-160px) scale(1.15); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          25%  { transform: translateY(0px) scale(1); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          40%  { transform: translateY(-50px) scale(1.05); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          58%  { transform: translateY(0px) scale(1); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          72%  { transform: translateY(-20px) scale(1.02); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          85%  { transform: translateY(0px) scale(1); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          93%  { transform: translateY(-5px) scale(1.01); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          100% { transform: translateY(0px) scale(1); }
        }
        .bouncing-dice { animation: throw-and-bounce ${ROLL_MS}ms forwards; }

        /* ★ PERFORMANCE FIX: Removed blur() filter, relying purely on opacity + scale */
        @keyframes physics-shadow {
          0%   { transform: scale(0.4) translateY(10px); opacity: 0.1; }
          25%  { transform: scale(1.0) translateY(0); opacity: 0.6; }
          40%  { transform: scale(0.6) translateY(6px); opacity: 0.2; }
          58%  { transform: scale(0.9) translateY(2px); opacity: 0.5; }
          85%  { transform: scale(0.98) translateY(0); opacity: 0.55; }
          100% { transform: scale(1) translateY(0); opacity: 0.6; }
        }
        .physics-shadow { animation: physics-shadow ${ROLL_MS}ms forwards; }

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

      <span className="sr-only" aria-live="polite">
        {!rolling && lastDice != null ? `Rolled a ${lastDice}` : ""}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            position: "relative",
            width: 80,
            height: 80,
            perspective: "400px",
            perspectiveOrigin: "50% 20%",
            transformStyle: "preserve-3d",
            transform: "rotateX(15deg)",
            opacity: disabled && !rolling && !settled ? 0.5 : 1,
            transition: "opacity 0.4s ease-out",
          }}
        >
          <div
            className={settled && !reducedMotion ? "settled-dice" : ""}
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 56,
              height: 56,
              top: 12,
              left: 12,
              transformStyle: "preserve-3d",
            }}
          >
            {/* ★ PERFORMANCE FIX: will-change applied here */}
            <div 
              ref={bounceRef} 
              style={{ 
                width: "100%", 
                height: "100%", 
                transformStyle: "preserve-3d",
                willChange: "transform" 
              }}
            >
              <div
                ref={wobbleRef}
                style={{
                  width: "100%",
                  height: "100%",
                  transformStyle: "preserve-3d",
                  willChange: "transform" /* Ensures the wobble layer gets accelerated */
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    transformStyle: "preserve-3d",
                    transform: `translateZ(-28px) rotateX(${rotations.x}deg) rotateY(${rotations.y}deg) rotateZ(${rollZ}deg)`,
                    transition: isAnimating
                      ? `transform ${ROLL_MS}ms cubic-bezier(0.05, 0.7, 0.2, 1.0)`
                      : "transform 0.8s cubic-bezier(0.22, 1.0, 0.36, 1)",
                    willChange: "transform",
                  }}
                >
                  {FACE_TRANSFORMS.map(({ face, transform }) => (
                    <div key={face} style={{ ...faceStyle, transform }}>
                      {PIPS[face].map(([col, row], i) => (
                        <div key={i} style={{ gridColumn: col, gridRow: row, display: "flex" }}>
                          <div style={{
                            width: 9, height: 9, borderRadius: "50%", margin: "auto",
                            backgroundColor: face === 1 ? "#e74c3c" : "#2b1d10",
                            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)"
                          }} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ★ PERFORMANCE FIX: Baked-in radial gradient replaces expensive blur() filter */}
          <div
            ref={shadowRef}
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              width: 56,
              height: 16,
              marginLeft: -28,
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 70%)",
              borderRadius: "50%",
              transform: "scale(1) translateY(0)",
              opacity: 0.6,
              zIndex: -1,
              willChange: "transform, opacity"
            }}
          />
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