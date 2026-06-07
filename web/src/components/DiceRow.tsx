import Dice from "./Dice";

interface DiceRowProps {
  onRoll: () => void;
  disabled: boolean;
  lastDice: number | null;
  rollKey: string;
  jumpMessage: string;
  onRollComplete?: () => void;
}

export default function DiceRow({ onRoll, disabled, lastDice, rollKey, jumpMessage, onRollComplete }: DiceRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%", marginTop: 16, marginBottom: 24, minHeight: 82 }}>
      <div style={{ flex: 1 }} />
      <div style={{ background: "var(--bg-tertiary)", borderRadius: 16, padding: "16px 24px", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", zIndex: 2, flexShrink: 0 }}>
        <Dice
          onRoll={onRoll}
          disabled={disabled}
          lastDice={lastDice}
          rollKey={rollKey}
          onRollComplete={onRollComplete}
        />
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", paddingLeft: 24 }}>
        {jumpMessage && (
          <div style={{ background: "var(--accent)", boxShadow: "var(--shadow-sm)", borderRadius: 24, padding: "12px 20px", fontSize: 15, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.2)", pointerEvents: "none" }}>
            {jumpMessage}
          </div>
        )}
      </div>
    </div>
  );
}
