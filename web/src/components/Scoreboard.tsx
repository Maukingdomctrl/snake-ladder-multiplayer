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
}: ScoreboardProps) {
  return (
    <div style={{ width: "100%", marginBottom: 4, display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
      {[...players]
        .sort((a, b) => (positions[b] ?? 1) - (positions[a] ?? 1))
        .map((pid, rank) => {
          const isActive = currentTurn === pid && status === "playing";
          return (
            <div
              key={pid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                flexShrink: 0,
                background: isActive ? "rgba(35,165,89,0.12)" : "var(--bg-tertiary)",
                border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 8px",
                boxShadow: isActive ? "0 0 0 2px rgba(35,165,89,0.25)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", minWidth: 10 }}>
                #{rank + 1}
              </span>

              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: playerColors[pid] || "#ccc",
                  flexShrink: 0,
                  boxShadow: isActive ? "0 0 0 2px var(--accent)" : "none",
                  transition: "box-shadow 0.3s ease",
                }}
              />

              <div>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  {playerNames[pid] || pid}{pid === playerId ? " (You)" : ""}{pid === winnerId ? " 🏆" : ""}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  Sq. {positions[pid] ?? 1}
                  {pid === currentTurn && status === "playing" && <span style={{ color: "#c9a84c" }}> · rolling...</span>}
                  {pid === lastRolledBy && lastDice ? <span> · rolled {lastDice}</span> : null}
                </p>
              </div>
            </div>
          );
        })}
    </div>
  );
}