import Dice from "./Dice";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

interface DiceRowProps {
  onRoll: () => void | Promise<void>;
  disabled: boolean;
  lastDice: Face | null;
  rollKey: string;
  jumpMessage: string;
  onRollComplete?: () => void;
  /** Fires at each physical contact (bounce) so the parent can react if needed. */
  onImpact?: (strength: number) => void;
  /** Master switch for built-in sound + vibration. Defaults to true. */
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
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        marginTop: 16,
        marginBottom: 24,
        minHeight: 82,
      }}
    >
      <div style={{ flex: 1 }} />

      <div
        style={{
          background: "var(--bg-tertiary)",
          borderRadius: 16,
          padding: "16px 24px",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)",
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        <Dice
          onRoll={onRoll}
          disabled={disabled}
          lastDice={lastDice}
          rollKey={rollKey}
          onRollComplete={onRollComplete}
          onImpact={onImpact}
          feedback={feedback}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "flex-start",
          paddingLeft: 24,
        }}
      >
        {jumpMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: "var(--accent)",
              boxShadow: "var(--shadow-sm)",
              borderRadius: 24,
              padding: "12px 20px",
              fontSize: 15,
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
