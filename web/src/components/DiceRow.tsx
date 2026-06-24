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
  // 1. Track the rolling state locally for the CSS fallback
  const [isRolling, setIsRolling] = useState(false);

  // 2. Intercept the roll to start the state
  const handleRoll = async () => {
    setIsRolling(true);
    await onRoll();
  };

  // 3. Intercept the completion to clear the state
  const handleRollComplete = () => {
    setIsRolling(false);
    if (onRollComplete) {
      onRollComplete();
    }
  };

  return (
    <div
      // 4. Apply the fallback class if rolling
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
          onRoll={handleRoll} /* Use intercepted handler */
          disabled={disabled}
          lastDice={lastDice}
          rollKey={rollKey}
          onRollComplete={handleRollComplete} /* Use intercepted handler */
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
        }}
      >
        {jumpMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: "var(--accent)",
              boxShadow: "var(--shadow-sm)",
              borderRadius: 20,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              whiteSpace: "nowrap",
              border: "1px solid rgba(255,255,255,0.2)",
              pointerEvents: "none",
            }}
          >
            {jumpMessage}
          </div>
        )}
      </div>
    </div>
  );
}