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
}

const inputStyle: React.CSSProperties = {
  fontSize: 16, // 16px+ stops iOS from zooming into the field
  padding: "14px 16px",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  outline: "none",
  minWidth: 0,
};


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
}: LoginScreenProps) {
  // Fixed top offset (measured once) so the card doesn't jump when the phone
  // keyboard opens and the visible area shrinks.
  // Lower on tall screens, but keep the card's bottom above the keyboard,
  // which covers roughly the lower half of a phone screen.
  const [topGap] = useState(() => {
    const h = window.innerHeight;
    const CARD_H = 300;
    return Math.max(20, Math.round(Math.min(h * 0.17, h * 0.46 - CARD_H)));
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
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", flex: 1, padding: `${topGap}px 12px 16px`, overflowY: "auto" }}>
      <div className="card" style={{ width: "100%", maxWidth: 460, padding: "32px 22px", display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
        <h1 style={{ fontSize: 30, margin: 0, color: "var(--text-primary)", fontWeight: 800, letterSpacing: -0.5 }}>
          Snakes &amp; Ladders
        </h1>

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
              style={inputStyle}
            />
            <button onClick={create} disabled={loading} className="btn-primary" style={{ padding: 14, fontSize: 16 }}>
              {loading && action === "create" ? "Creating…" : "Create room"}
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
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={join} disabled={loading} className="btn-secondary" style={{ padding: "0 24px", fontSize: 16 }}>
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
