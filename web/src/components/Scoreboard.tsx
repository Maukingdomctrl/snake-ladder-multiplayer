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
  const sorted = [...players].sort((a, b) => (positions[b] ?? 1) - (positions[a] ?? 1));
  // The server moves currentTurn on as soon as a roll lands, while the dice is
  // still rolling on screen: until it settles, the highlighted player is the
  // one who rolled (same as the "X's turn" line in App).
  const shownTurn = diceComplete ? currentTurn : (lastRolledBy ?? currentTurn);
  const label = (pid: string) => {
    const isActive = shownTurn === pid && status === "playing";
    // "rolling..." while their dice and token are still moving; then what they rolled
    return (
      <>
        Sq. {positions[pid] ?? 1}
        {isActive && !diceComplete && <span style={{ color: "#c9a84c" }}> · rolling...</span>}
        {pid === lastRolledBy && lastDice && diceComplete ? <span> · rolled {lastDice}</span> : null}
      </>
    );
  };

  // Phones and tablets: one slim row above the board (the board is the hero).
  // The highlighted chip is whose turn it is; there's no separate turn line.
  if (!vertical) {
    return (
      <div className="scoreboard scoreboard--row" role="list" aria-label="Players">
        {sorted.map((pid) => {
          const isActive = shownTurn === pid && status === "playing";
          return (
            <div
              key={pid}
              role="listitem"
              className={`score-chip${isActive ? " is-turn" : ""}`}
              aria-current={isActive ? "true" : undefined}
            >
              <span className="score-chip__dot" style={{ background: playerColors[pid] || "#ccc" }} />
              <span className="score-chip__name">
                {pid === playerId ? "You" : playerNames[pid] || pid}
                {pid === winnerId ? " 🏆" : ""}
              </span>
              <p className="score-chip__sq">{label(pid)}</p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="scoreboard scoreboard--vertical">
      {sorted.map((pid, rank) => {
        const isActive = shownTurn === pid && status === "playing";
        return (
          <div
            key={pid}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
              background: isActive ? "rgba(35,165,89,0.12)" : "var(--bg-tertiary)",
              border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: 8,
              padding: "9px 12px",
              boxShadow: isActive ? "0 0 0 2px rgba(35,165,89,0.25)" : "none",
              transition: "all 0.3s ease",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 18 }}>
              #{rank + 1}
            </span>

            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: playerColors[pid] || "#ccc",
                flexShrink: 0,
                boxShadow: isActive ? "0 0 0 2px var(--accent)" : "none",
                transition: "box-shadow 0.3s ease",
              }}
            />

            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                {playerNames[pid] || pid}{pid === playerId ? " (You)" : ""}{pid === winnerId ? " 🏆" : ""}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                {label(pid)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}