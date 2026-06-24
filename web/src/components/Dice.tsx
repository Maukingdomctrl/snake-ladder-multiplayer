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

// Physics impacts mapped to animation keyframes
const IMPACTS: { at: number; strength: number }[] = [
  { at: 0.25, strength: 1.0 },
  { at: 0.58, strength: 0.5 },
  { at: 0.85, strength: 0.2 },
];

// Right-handed Western die. Opposite faces sum to 7; 1-2-3 counterclockwise
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

/* ---------- High-Tech Audio Engine (Cached & Synthesized) ---------- */

let audioCtx: AudioContext | null = null;
let noiseBufferCache: AudioBuffer | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
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

// Generate noise buffer once to prevent GC spikes during animation
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
  const ctx = getAudioCtx();
  if (!ctx) return; // Bypass state check, let Web Audio handle queueing
  
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const vol = 0.06 + strength * 0.22;
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + strength * 0.08);
  gain.connect(ctx.destination);

  // Noise burst (the "tick")
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800 + strength * 800;
  bp.Q.value = 0.9;
  noise.connect(bp).connect(gain);

  // Low body thud
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
}: DiceProps) {
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
  
  // Refs to bypass React reconciliation during high-frequency animation updates
  const onRollCompleteRef = useRef(onRollComplete);
  const onImpactRef = useRef(onImpact);
  const feedbackRef = useRef(feedback);
  
  // Bypass React state for visual physics (wobble) to prevent frame drops
  const wobbleRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  // Pure math tracking for 3D rotation paths
  const currentRotRef = useRef({ x: 0, y: 0 });
  const prevTargetX = useRef(0);
  const prevTargetY = useRef(0);

  const bounceRef = useRef<HTMLDivElement>(null);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
    const shadow = shadowRef.current;
    if (el) {
      el.classList.remove("bouncing-dice");
      void el.offsetWidth; // Force reflow
      el.classList.add("bouncing-dice");
    }
    if (shadow) {
      shadow.classList.remove("physics-shadow");
      void shadow.offsetWidth;
      shadow.classList.add("physics-shadow");
    }
  };

  // Damped Harmonic Oscillator for micro-wobble
  const applyDampedWobble = (strength: number) => {
    const el = wobbleRef.current;
    if (!el) return;
    
    const amp = 6 * strength;
    const gamma = 4; // Damping factor
    const omega = 18; // Frequency
    
    let t = 0;
    const animateWobble = () => {
      t += 16;
      const decay = Math.exp(-gamma * (t / 1000));
      const offset = amp * decay * Math.cos(omega * (t / 1000));
      
      if (Math.abs(offset) < 0.1) {
        el.style.transform = "rotateX(0deg) rotateY(0deg)";
        return;
      }
      el.style.transform = `rotateX(${offset}deg) rotateY(${offset * 0.5}deg)`;
      requestAnimationFrame(animateWobble);
    };
    requestAnimationFrame(animateWobble);
  };

  const fireImpact = (strength: number) => {
    onImpactRef.current?.(strength);
    if (feedbackRef.current) {
      playClack(strength);
      vibrate(strength);
    }
  };

  // Initialize orientation if joining mid-game
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

  // Handle rolling animation physics
  useEffect(() => {
    if (lastDice == null) return;
    if (!rollKey || processedRollKeyRef.current === rollKey) return;

    processedRollKeyRef.current = rollKey;

    const [tx, ty] = BASE_ANGLES[lastDice];

    if (reducedMotion) {
      clearAllTimers();
      prevTargetX.current = tx;
      prevTargetY.current = ty;
      currentRotRef.current = { x: tx, y: ty };
      setIsAnimating(false);
      setRolling(false);
      setRollZ(0);
      setRotations({ x: tx, y: ty });
      scheduleSettle();
      onRollCompleteRef.current?.();
      return;
    }

    setRolling(true);
    setSettled(false);

    clearAllTimers();
    setIsAnimating(true);
    restartBounce();

    // Calculate shortest physical path safely outside React state updater
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
    setRollZ(zSpin);

    // Schedule impact feedback at each contact frame
    impactTimeoutsRef.current = IMPACTS.map(({ at, strength }) =>
      setTimeout(() => {
        fireImpact(strength);
        applyDampedWobble(strength);
      }, ROLL_MS * at)
    );

    finishTimeoutRef.current = setTimeout(() => {
      setRolling(false);
      setIsAnimating(false);
      setRollZ(0);
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
    getAudioCtx(); // Unlock audio on gesture
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
        
        /* Dynamic Shadow maps inverse to height */
        @keyframes physics-shadow {
          0%   { transform: scale(0.4) translateY(10px); opacity: 0.1; filter: blur(8px); }
          25%  { transform: scale(1.0) translateY(0); opacity: 0.6; filter: blur(2px); }
          40%  { transform: scale(0.6) translateY(6px); opacity: 0.2; filter: blur(6px); }
          58%  { transform: scale(0.9) translateY(2px); opacity: 0.5; filter: blur(3px); }
          85%  { transform: scale(0.98) translateY(0); opacity: 0.55; filter: blur(2px); }
          100% { transform: scale(1) translateY(0); opacity: 0.6; filter: blur(2px); }
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
        {/* Scene Wrapper - Tilts camera 15deg for true 3D perspective depth */}
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
          {/* Dice Layer */}
          <div
            className={settled ? "settled-dice" : ""}
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
            <div ref={bounceRef} style={{ width: "100%", height: "100%", transformStyle: "preserve-3d" }}>
              {/* Wobble Wrapper - Direct DOM manipulation bypasses React frame drops */}
              <div 
                ref={wobbleRef} 
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  transformStyle: "preserve-3d",
                  transition: "transform 0.05s ease-out" 
                }}
              >
                {/* Main Transform Inner Cube */}
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

          {/* Physics Shadow Layer */}
          <div
            ref={shadowRef}
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              width: 56,
              height: 16,
              marginLeft: -28,
              backgroundColor: "rgba(0,0,0,0.6)",
              borderRadius: "50%",
              transform: "scale(1) translateY(0)",
              opacity: 0.6,
              filter: "blur(2px)",
              zIndex: -1,
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