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
        position: "relative",
        // Dropped to 50 so it renders safely below the chat drawer (which is 500)
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <div className="dice-spacer" />
      <div
        style={{
          background: "var(--bg-tertiary)",
          borderRadius: 14,
          padding: "10px 20px",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)",
          flexShrink: 0,
          pointerEvents: "auto",
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

      <div className="pill-wrapper">
        {jumpMessage && (
          <div
            role="status"
            aria-live="polite"
            className="jump-message-pill"
            style={{
              position: "relative",
              // Dropped to 50 to match the parent container
              zIndex: 50,
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
        .dice-spacer {
          flex: 1;
        }

        .pill-wrapper {
          flex: 1;
          display: flex;
          justify-content: flex-start;
          padding-left: 20px;
          min-width: 0;
          pointer-events: none;
        }

        .jump-message-pill {
          max-width: min(60vw, 320px);
        }

        /* Mobile Layout */
        @media (max-width: 768px) {
          .dice-row-container {
            flex-wrap: wrap;
            justify-content: center;
            row-gap: 8px;
          }

          .dice-spacer {
            display: none;
          }

          /* Forces the pill to its own full-width row under the dice */
          .pill-wrapper {
            flex: 1 1 100%;
            justify-content: center;
            padding-left: 0;
            margin-top: 4px;
          }

          .jump-message-pill {
            max-width: 92vw;
          }
        }
      `}</style>
    </div>
  );
}