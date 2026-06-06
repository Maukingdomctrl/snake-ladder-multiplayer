import { useState, useEffect, useRef } from "react";

const BASE_ANGLES: Record<number, [number, number]> = {
  1: [0, 0],
  2: [90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [-90, 0],
  6: [0, 180]
};

const Dot = ({ color = '#2b2620' }: { color?: string }) => (
  <div
    style={{
      width: 13,
      height: 13,
      borderRadius: '50%',
      backgroundColor: color === '#2b2620' ? '#2b1d10' : color,
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
      margin: 'auto'
    }}
  />
);

export default function Dice({ onRoll, disabled, lastDice, rollKey, onRollComplete }: any) {
  const [rotations, setRotations] = useState({ x: 0, y: 0 });
  const [rollZ, setRollZ] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [rolling, setRolling] = useState(false);

  const processedRollKeyRef = useRef("");
  const isFirstLoad = useRef(true);
  const onRollCompleteRef = useRef(onRollComplete);
  const animatingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    onRollCompleteRef.current = onRollComplete;
  }, [onRollComplete]);

  useEffect(() => {
    if (!lastDice) return;

    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      processedRollKeyRef.current = rollKey || "";
      const base = BASE_ANGLES[lastDice];
      setRotations({ x: base[0], y: base[1] });
      return;
    }

    if (!rollKey || processedRollKeyRef.current === rollKey) return;

    processedRollKeyRef.current = rollKey;
    setRolling(true);

    setIsAnimating(false);
    if (animatingTimeoutRef.current) clearTimeout(animatingTimeoutRef.current);
    animatingTimeoutRef.current = setTimeout(() => setIsAnimating(true), 10);

    setRotations((prev) => {
      const baseCurrentX = Math.round(prev.x / 360) * 360;
      const baseCurrentY = Math.round(prev.y / 360) * 360;
      const spinX = (Math.floor(Math.random() * 4) + 6) * 360 * (Math.random() > 0.5 ? 1 : -1);
      const spinY = (Math.floor(Math.random() * 5) + 7) * 360 * (Math.random() > 0.5 ? 1 : -1);
      const targetBase = BASE_ANGLES[lastDice];
      return {
        x: baseCurrentX + spinX + targetBase[0],
        y: baseCurrentY + spinY + targetBase[1]
      };
    });

    const zSpin = (Math.floor(Math.random() * 4) + 3) * 360 + Math.floor(Math.random() * 270);
    setRollZ(zSpin);

    const timer = setTimeout(() => {
      setRolling(false);
      setIsAnimating(false);
      setRollZ(0);
      onRollCompleteRef.current?.();
    }, 2800);

    return () => clearTimeout(timer);
  }, [rollKey, lastDice]);

  const faceStyle: React.CSSProperties = {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#f5ede0',
    border: '1px solid #c4a882',
    borderRadius: 8,
    boxShadow: 'inset 0 0 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4)',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    padding: 6,
    backfaceVisibility: 'hidden',
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
        .bouncing-dice { animation: throw-and-bounce 2.8s forwards; }
        @keyframes impact-tilt {
          0%   { transform: rotateZ(-8deg); }
          28%  { transform: rotateZ(2deg); }
          100% { transform: rotateZ(0deg); }
        }
        .dice-tilt { animation: impact-tilt 2.8s forwards; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            perspective: 300,
            opacity: disabled && !rolling ? 0.5 : 1,
            transition: 'opacity 0.2s, filter 0.25s ease-out',
            filter: rolling
              ? "drop-shadow(0 0 18px rgba(35, 165, 89, 0.8)) drop-shadow(0 0 6px rgba(35, 165, 89, 0.4))"
              : "drop-shadow(0 3px 6px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(245, 158, 11, 0.25))",
          }}
        >
          <div className={isAnimating ? "bouncing-dice" : ""} style={{ width: '100%', height: '100%' }}>
            <div className={isAnimating ? "dice-tilt" : ""} style={{ width: '100%', height: '100%' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  transformStyle: 'preserve-3d',
                  transform: `translateZ(-28px) rotateX(${rotations.x}deg) rotateY(${rotations.y}deg) rotateZ(${isAnimating ? rollZ : 0}deg)`,
                  transition: isAnimating ? 'transform 2.8s cubic-bezier(0.05, 0.7, 0.2, 1.0)' : 'transform 0s',
                  willChange: 'transform',
                }}
              >
                {/* Face 1 — front, red pip */}
                <div style={{ ...faceStyle, transform: 'rotateY(0deg) translateZ(28px)' }}>
                  <div style={{ gridColumn: 2, gridRow: 2, display: 'flex' }}><Dot color="#e74c3c" /></div>
                </div>
                {/* Face 6 — back */}
                <div style={{ ...faceStyle, transform: 'rotateY(180deg) translateZ(28px)' }}>
                  <div style={{ gridColumn: 1, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 1, gridRow: 2, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 1, gridRow: 3, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 3, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 3, gridRow: 2, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 3, gridRow: 3, display: 'flex' }}><Dot /></div>
                </div>
                {/* Face 3 — right */}
                <div style={{ ...faceStyle, transform: 'rotateY(90deg) translateZ(28px)' }}>
                  <div style={{ gridColumn: 3, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 2, gridRow: 2, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 1, gridRow: 3, display: 'flex' }}><Dot /></div>
                </div>
                {/* Face 4 — left */}
                <div style={{ ...faceStyle, transform: 'rotateY(-90deg) translateZ(28px)' }}>
                  <div style={{ gridColumn: 1, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 3, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 1, gridRow: 3, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 3, gridRow: 3, display: 'flex' }}><Dot /></div>
                </div>
                {/* Face 5 — top */}
                <div style={{ ...faceStyle, transform: 'rotateX(90deg) translateZ(28px)' }}>
                  <div style={{ gridColumn: 1, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 3, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 2, gridRow: 2, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 1, gridRow: 3, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 3, gridRow: 3, display: 'flex' }}><Dot /></div>
                </div>
                {/* Face 2 — bottom */}
                <div style={{ ...faceStyle, transform: 'rotateX(-90deg) translateZ(28px)' }}>
                  <div style={{ gridColumn: 3, gridRow: 1, display: 'flex' }}><Dot /></div>
                  <div style={{ gridColumn: 1, gridRow: 3, display: 'flex' }}><Dot /></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={async () => { if (!disabled && !rolling) await onRoll(); }}
          disabled={disabled || rolling}
          style={{ minHeight: 44, minWidth: 100 }}
        >
          {rolling ? "Rolling..." : "Roll Dice"}
        </button>
      </div>
    </>
  );
}