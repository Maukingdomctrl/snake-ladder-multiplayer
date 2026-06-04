import { useState, useRef } from "react";

const FACES = {
  1: ["c"],
  2: ["tl", "br"],
  3: ["tl", "c", "br"],
  4: ["tl", "tr", "bl", "br"],
  5: ["tl", "tr", "c", "bl", "br"],
  6: ["tl", "tr", "ml", "mr", "bl", "br"],
};

const ALL_DOTS = ["tl", "tr", "ml", "mr", "c", "bl", "br"];

const DOT_STYLE = {
  tl: { gridArea: "1 / 1" },
  tr: { gridArea: "1 / 3" },
  ml: { gridArea: "2 / 1" },
  mr: { gridArea: "2 / 3" },
  c:  { gridArea: "2 / 2" },
  bl: { gridArea: "3 / 1" },
  br: { gridArea: "3 / 3" },
};

export default function Dice({ onRoll, disabled, lastDice }) {
  const [face, setFace] = useState(lastDice || 1);
  const [rolling, setRolling] = useState(false);
  const shuffleRef = useRef(null);

  const handleRoll = async () => {
    if (disabled || rolling) return;
    setRolling(true);

    let count = 0;
    shuffleRef.current = setInterval(() => {
      setFace(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 18) clearInterval(shuffleRef.current);
    }, 120);

    await onRoll();

    setTimeout(() => {
      clearInterval(shuffleRef.current);
      setFace(lastDice || face);
      setRolling(false);
    }, 3000);
  };

  return (
    <>
      <style>{`
        .dice-wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; }
        .dice-scene { position: relative; width: 80px; height: 120px; display: flex; align-items: flex-end; justify-content: center; }
        .dice {
          width: 80px; height: 80px;
          background: #fff;
          border-radius: 14px;
          border: 1.5px solid #ccc;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(3, 1fr);
          padding: 10px;
          box-sizing: border-box;
        }
        .dice.rolling { animation: dicefall 3s cubic-bezier(0.22,1,0.36,1) forwards; }
        .dot {
          width: 10px; height: 10px;
          background: #1a1a1a;
          border-radius: 50%;
          align-self: center; justify-self: center;
        }
        .dice-shadow {
          width: 70px; height: 8px;
          background: rgba(0,0,0,0.1);
          border-radius: 50%;
          position: absolute; bottom: -4px;
        }
        .dice.rolling ~ .dice-shadow { animation: shadowanim 3s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes dicefall {
          0%   { transform: translateY(-100px) rotate(-25deg); opacity: 0; }
          18%  { transform: translateY(0) rotate(7deg); opacity: 1; }
          28%  { transform: translateY(-24px) rotate(-5deg); }
          38%  { transform: translateY(0) rotate(3deg); }
          48%  { transform: translateY(-10px) rotate(-2deg); }
          58%  { transform: translateY(0) rotate(1deg); }
          72%  { transform: translateY(-4px); }
          100% { transform: translateY(0) rotate(0deg); }
        }
        @keyframes shadowanim {
          0%   { transform: scaleX(0.2); opacity: 0; }
          18%  { transform: scaleX(1); opacity: 1; }
          28%  { transform: scaleX(1.1); opacity: 0.6; }
          38%  { transform: scaleX(1); opacity: 1; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        .dice-btn {
          padding: 8px 24px;
          font-size: 14px;
          border-radius: 8px;
          border: 1px solid #ccc;
          background: transparent;
          cursor: pointer;
        }
        .dice-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .dice-btn:hover:not(:disabled) { background: #f5f5f5; }
      `}</style>

      <div className="dice-wrap">
        <div className="dice-scene">
          <div className={`dice${rolling ? " rolling" : ""}`}>
            {ALL_DOTS.map((pos) => (
              <div
                key={pos}
                className="dot"
                style={{
                  ...DOT_STYLE[pos],
                  visibility: FACES[face].includes(pos) ? "visible" : "hidden",
                }}
              />
            ))}
          </div>
          <div className="dice-shadow" />
        </div>

        <button className="dice-btn" onClick={handleRoll} disabled={disabled || rolling}>
          {rolling ? "Rolling..." : "Roll Dice"}
        </button>
      </div>
    </>
  );
}