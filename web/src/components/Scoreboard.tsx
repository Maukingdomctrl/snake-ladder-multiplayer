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
    <div style={{ width: "100%", marginBottom: 12, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
      {[...players]
        .sort((a, b) => (positions[b] ?? 1) - (positions[a] ?? 1))
        .map((pid, rank) => {
          const isActive = currentTurn === pid && status === "playing";
          return (
            <div key={pid} style={{
              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              background: isActive ? "rgba(35,165,89,0.12)" : "var(--bg-tertiary)",
              border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: 10, 
              padding: "10px 16px",
              boxShadow: isActive ? "0 0 0 2px rgba(35,165,89,0.25)" : "none",
              transition: "all 0.3s ease",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 14 }}>#{rank + 1}</span>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: playerColors[pid] || "#ccc", flexShrink: 0,
                boxShadow: isActive ? "0 0 0 3px var(--accent)" : "none",
                transition: "box-shadow 0.3s ease",
              }} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>
                  {playerNames[pid] || pid}{pid === playerId ? " (You)" : ""}{pid === winnerId ? " 🏆" : ""}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.2 }}>
                  Sq. {positions[pid] ?? 1}
                </p>
                
                {pid === currentTurn && status === "playing" && (
                  <p style={{ margin: 0, fontSize: 10, color: "#c9a84c", lineHeight: 1.2 }}>
                    rolling...
                  </p>
                )}
                
                {pid === lastRolledBy && lastDice && (
                  <p style={{ margin: 0, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.2 }}>
                    rolled {lastDice}
                  </p>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}