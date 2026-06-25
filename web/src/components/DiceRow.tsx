import React, { useState } from "react";
import Dice from "./Dice";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

interface DiceRowProps {
  onRoll: () => void | Promise<void>;
  disabled: boolean;
  lastDice: Face | null;
  rollKey: string;
  jumpMessage: string;
  onRollComplete?: () => void;
  onImpact?: (strength: number) => void;
  feedback?: boolean;
}

export default function DiceRow({
  onRoll,
  disabled,
  lastDice,
  rollKey,
  jumpMessage,
  onRollComplete,
  onImpact,
  feedback = true,
}: DiceRowProps) {
  const [isRolling, setIsRolling] = useState(false);

  const handleRoll = async () => {
    setIsRolling(true);
    await onRoll();
  };

  const handleRollComplete = () => {
    setIsRolling(false);
    if (onRollComplete) {
      onRollComplete();
    }
  };

  return (
    <div
      className={`dice-row-container ${isRolling ? "has-active-dice" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        marginTop: 6,
        marginBottom: 8,
        minHeight: 68,
      }}
    >
      <div style={{ flex: 1 }} />
      <div
        style={{
          background: "var(--bg-tertiary)",
          borderRadius: 14,
          padding: "10px 20px",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)",
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        <Dice
          onRoll={handleRoll}
          disabled={disabled}
          lastDice={lastDice}
          rollKey={rollKey}
          onRollComplete={handleRollComplete}
          onImpact={onImpact}
          feedback={feedback}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "flex-start",
          paddingLeft: 20,
          minWidth: 0,
        }}
      >
        {jumpMessage && (
          <div
            role="status"
            aria-live="polite"
            className="jump-message-pill"
            style={{
              background: "var(--accent)",
              boxShadow: "var(--shadow-sm)",
              borderRadius: 20,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              whiteSpace: "normal",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.2)",
              pointerEvents: "none",
            }}
          >
            {jumpMessage}
          </div>
        )}
      </div>

      <style>{`
  /*
    BUG FIX (snake/ladder popup not showing correctly on mobile):
    previously the pill lived in a "flex: 1" side spacer with
    whiteSpace: "nowrap". On a narrow phone, that spacer is only
    (screenWidth - diceWidth) / 2 wide — often under ~100-120px —
    so a message like "🪜 Ladder! 47 → 96" had nowhere near enough
    room and clipped/overflowed. Desktop keeps the original
    side-by-side look (capped width so it can't outgrow the row);
    narrow screens drop the pill to its own centered, full-width
    row below the dice instead of squeezing it into a sliver.
  */
  .jump-message-pill {
    max-width: min(60vw, 320px);
  }
  @media (max-width: 480px) {
    .dice-row-container {
      flex-wrap: wrap;
      justify-content: center;
      row-gap: 6px;
    }
    .dice-row-container > div:first-child {
      display: none;
    }
    .dice-row-container > div:last-of-type {
      flex: 1 1 100%;
      justify-content: center;
      padding-left: 0;
    }
    .jump-message-pill {
      max-width: 92vw;
    }
  }
`}</style>
    </div>
  );
}