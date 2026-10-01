import { RoomStatus } from "../firebase/rooms";

interface ScoreboardProps {
  players: string[];
  positions: Record<string, number>;
  playerColors: Record<string, string>;
  playerNames: Record<string, string>;
  currentTurn: string;
  status: RoomStatus;
  winnerId: string | null;
  playerId: string;
  lastDice?: number | null;
  lastRolledBy?: string | null;
  // BUG FIX: previously the "rolling..." label was driven only by
  // `currentTurn === pid && status === "playing"`, with no awareness of
  // whether the dice animation / token walk was actually still in
  // progress. That let the label (and, before the App.tsx fix, the
  // position number) flip to its final state the instant Firestore pushed
  // the roll, while the token on the board was still visibly walking.
  // Passing diceComplete lets this component show "rolling..." for
  // exactly as long as the board is actually animating.
  diceComplete?: boolean;
  /** Desktop side panel: one full-width row per player, larger type. */
  vertical?: boolean;
}

export default function Scoreboard({
  players,
  positions,
  playerColors,
  playerNames,
  currentTurn,
  status,
  winnerId,
  playerId,
  lastDice,
  lastRolledBy,
  diceComplete = true,
  vertical = false,
}: ScoreboardProps) {
  return (
    <div
      className={vertical ? "scoreboard scoreboard--vertical" : "scoreboard"}
      style={vertical ? undefined : { width: "100%", marginBottom: 4, display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}
    >
      {[...players]
        .sort((a, b) => (positions[b] ?? 1) - (positions[a] ?? 1))
        .map((pid, rank) => {
          const isActive = currentTurn === pid && status === "playing";
          // A player only reads as "currently rolling/moving" while it's
          // their active turn AND the board hasn't finished animating
          // their move yet. Once diceComplete is true again, the label
          // clears — matching exactly when the token actually stops.
          const isCurrentlyMoving = isActive && !diceComplete;
          return (
            <div
              key={pid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: vertical ? 10 : 5,
                flexShrink: 0,
                background: isActive ? "rgba(35,165,89,0.12)" : "var(--bg-tertiary)",
                border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: vertical ? 8 : 6,
                padding: vertical ? "9px 12px" : "4px 8px",
                boxShadow: isActive ? "0 0 0 2px rgba(35,165,89,0.25)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              <span style={{ fontSize: vertical ? 11 : 9, fontWeight: 700, color: "var(--text-muted)", minWidth: vertical ? 18 : 10 }}>
                #{rank + 1}
              </span>

              <div
                style={{
                  width: vertical ? 28 : 22,
                  height: vertical ? 28 : 22,
                  borderRadius: "50%",
                  background: playerColors[pid] || "#ccc",
                  flexShrink: 0,
                  boxShadow: isActive ? "0 0 0 2px var(--accent)" : "none",
                  transition: "box-shadow 0.3s ease",
                }}
              />

              <div style={vertical ? { minWidth: 0 } : undefined}>
                <p style={{ margin: 0, fontSize: vertical ? 14 : 11.5, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  {playerNames[pid] || pid}{pid === playerId ? " (You)" : ""}{pid === winnerId ? " 🏆" : ""}
                </p>
                <p style={{ margin: vertical ? "2px 0 0" : 0, fontSize: vertical ? 12.5 : 10, color: "var(--text-muted)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  Sq. {positions[pid] ?? 1}
                  {isCurrentlyMoving && <span style={{ color: "#c9a84c" }}> · rolling...</span>}
                  {pid === lastRolledBy && lastDice && diceComplete ? <span> · rolled {lastDice}</span> : null}
                </p>
              </div>
            </div>
          );
        })}
    </div>
  );
}