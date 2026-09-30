import { useState } from "react";

interface LoginScreenProps {
  ready: boolean;
  playerName: string;
  setPlayerName: (name: string) => void;
  joinId: string;
  setJoinId: (id: string) => void;
  error: string;
  loading: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  /** Which game "Create room" starts. Joining follows the room code. */
  game: "snakes" | "ludo";
  setGame: (game: "snakes" | "ludo") => void;
}

const GAMES = [
  { id: "snakes", label: "Snakes & Ladders" },
  { id: "ludo", label: "Ludo" },
] as const;

const inputStyle: React.CSSProperties = {
  fontSize: 16, // 16px+ stops iOS from zooming into the field
  padding: "13px 16px",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  outline: "none",
  minWidth: 0,
};


const bigInput: React.CSSProperties = { ...inputStyle, fontSize: 17, padding: "16px 18px" };

export default function LoginScreen({
  ready,
  playerName,
  setPlayerName,
  joinId,
  setJoinId,
  error,
  loading,
  onCreateRoom,
  onJoinRoom,
  game,
  setGame,
}: LoginScreenProps) {
  // Fixed top offset (measured once) so the card doesn't jump when the phone
  // keyboard opens and the visible area shrinks.
  // Measured once, so nothing moves when the keyboard opens. The keyboard
  // covers roughly the lower half of a phone screen: the card sits in the
  // upper half and stretches down to just above where the keyboard starts.
  const [layout] = useState(() => {
    const h = window.innerHeight;
    const keyboardTop = h * 0.48 - 24;
    const top = Math.max(20, Math.min(h * 0.15, keyboardTop - 300));
    const minHeight = Math.max(300, Math.min(440, keyboardTop - top));
    // Small phones get slightly smaller controls so the card still fits
    return { top: Math.round(top), minHeight: Math.round(minHeight), large: h >= 860 };
  });
  const [action, setAction] = useState<"create" | "join" | null>(null);
  const create = () => {
    setAction("create");
    onCreateRoom();
  };
  const join = () => {
    setAction("join");
    onJoinRoom();
  };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", flex: 1, padding: `${layout.top}px 12px 16px`, overflowY: "auto" }}>
      <div className="card" style={{ width: "100%", maxWidth: 460, minHeight: layout.minHeight, padding: layout.large ? "32px 22px" : "24px 18px", display: "flex", flexDirection: "column", justifyContent: "space-evenly", gap: 16, textAlign: "center" }}>
        <h1 className="sr-only">{game === "ludo" ? "Ludo" : "Snakes & Ladders"}</h1>
        {/* The game switch doubles as the title */}
        <div className={`game-switch${layout.large ? " game-switch--large" : ""}`} role="radiogroup" aria-label="Game">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={game === g.id}
              className={game === g.id ? "is-active" : ""}
              onClick={() => setGame(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>

        {!ready && !error ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Connecting…</p>
        ) : (
          <>
            <input
              placeholder="Your name"
              onKeyDown={(e) => e.key === "Enter" && create()}
              maxLength={20}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={layout.large ? bigInput : inputStyle}
            />
            <button onClick={create} disabled={loading} className="btn-primary" style={{ padding: layout.large ? 16 : 13, fontSize: layout.large ? 17 : 16 }}>
              {loading && action === "create" ? "Creating…" : game === "ludo" ? "Create Ludo room" : "Create room"}
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="Room code"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && join()}
                style={{ ...(layout.large ? bigInput : inputStyle), flex: 1 }}
              />
              <button onClick={join} disabled={loading} className="btn-secondary" style={{ padding: "0 24px", fontSize: layout.large ? 17 : 16 }}>
                {loading && action === "join" ? "Joining…" : "Join"}
              </button>
            </div>

          </>
        )}

        {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 14 }}>{error}</p>}
      </div>
    </div>
  );
}
