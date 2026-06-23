interface GameHeaderProps {
  roomId: string;
  players: string[];
  playerColors: Record<string, string>;
  playerNames: Record<string, string>;
  isTablet: boolean;
}

export default function GameHeader({ roomId, players, playerColors, playerNames, isTablet }: GameHeaderProps) {
  return (
    <div
      className="channel-header"
      style={{
        margin: "0 -12px",
        borderRadius: isTablet ? "8px 8px 0 0" : "0",
        height: "var(--header-h)",
        minHeight: "var(--header-h)",
        padding: "0 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 18, fontWeight: 300 }}>#</span>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
          game-room-{roomId}
        </h2>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {players.map((pid, idx) => (
            <div
              key={`dot-${pid}`}
              style={{
                position: "relative",
                marginLeft: idx === 0 ? 0 : -6,
                zIndex: players.length - idx,
              }}
            >
              <div
                style={{
                  width: 12, 
                  height: 12, 
                  borderRadius: "50%",
                  backgroundColor: playerColors[pid] || "#ccc",
                  border: "2px solid var(--bg-primary)",
                }}
                title={playerNames[pid] || pid}
              />
              <div className="online-dot" style={{ width: 9, height: 9 }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>
          <span>👥</span>
          <span>{players.length}</span>
        </div>
      </div>
    </div>
  );
}