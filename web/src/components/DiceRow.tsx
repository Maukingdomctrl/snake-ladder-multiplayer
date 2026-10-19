import { useState } from "react";
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

/**
 * Desktop side panel (Snakes & Ladders): the dice card with the snake/ladder
 * message under it. Phones and tablets don't use this: their die floats on
 * the board (App.tsx, <Dice floating>).
 */
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
      className={`dice-row-container ${isRolling ? "has-active-dice" : ""} dice-row--stacked`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        minHeight: 68,
      }}
    >
      <div
        // Glows while it's your turn (App.css .dice-card)
        className={`dice-card${!disabled && !isRolling ? " is-ready" : ""}`}
        style={{
          background: "var(--bg-tertiary)",
          borderRadius: 10,
          padding: "10px 20px",
          border: "1px solid var(--border)",
          flexShrink: 0,
          alignSelf: "stretch",
          display: "flex",
          justifyContent: "center",
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

      {/* The message's line is reserved so the panel never jumps */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          minHeight: 52,
          alignItems: "center",
          width: "100%",
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
            }}
          >
            {jumpMessage}
          </div>
        )}
      </div>
    </div>
  );
}
