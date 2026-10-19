import type { ReactNode } from "react";

interface GameHeaderProps {
  roomId: string;
  players: string[];
  playerColors: Record<string, string>;
  playerNames: Record<string, string>;
  isTablet: boolean;
  /** Large screens: a full-width app bar with avatars instead of dots. */
  isDesktop?: boolean;
  gameName?: string;
  /** Phones during a game: the players (and whose turn it is) live in the
   *  header itself, so the board gets the room below it. */
  children?: ReactNode;
}

export default function GameHeader({ roomId, players, playerColors, playerNames, isTablet, isDesktop, gameName, children }: GameHeaderProps) {
  if (isDesktop) {
    return (
      <header className="app-header">
        <div className="app-header__title">
          <span className="app-header__hash" aria-hidden="true">#</span>
          <h2>game-room-{roomId}</h2>
          {gameName && <span className="app-header__game">{gameName}</span>}
        </div>
        <ul className="app-header__players" aria-label="Players in this room">
          {players.map((pid) => (
            <li
              key={pid}
              title={playerNames[pid] || pid}
              style={{ ["--avatar" as string]: playerColors[pid] || "#9ca3af" }}
            >
              {(playerNames[pid] || "?").charAt(0).toUpperCase()}
            </li>
          ))}
        </ul>
        <span className="app-header__count">
          {players.length} {players.length === 1 ? "player" : "players"}
        </span>
      </header>
    );
  }

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
      <div style={{ display: "flex", alignItems: "center", gap: children ? 3 : 6, flexShrink: 0 }}>
        <span style={{ color: "var(--text-muted)", fontSize: children ? 15 : 18, fontWeight: 300 }}>#</span>
        <h2 style={{ margin: 0, fontSize: children ? 13 : 14, fontWeight: 700, color: children ? "var(--text-secondary)" : "var(--text-primary)" }}>
          {children ? roomId : `game-room-${roomId}`}
        </h2>
      </div>

      {children ? (
        <div className="header-game">{children}</div>
      ) : (
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
      )}
    </div>
  );
}