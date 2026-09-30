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
  fontSize: 15,
  padding: "12px 14px",
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
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14, textAlign: "center" }}>
        <h1 style={{ fontSize: 26, margin: 0, color: "var(--text-primary)", fontWeight: 800, letterSpacing: -0.5 }}>
          Snakes &amp; Ladders
        </h1>

        {!ready && !error ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Connecting…</p>
        ) : (
          <>
            <input
              placeholder="Your name"
              onKeyDown={(e) => e.key === "Enter" && onCreateRoom()}
              maxLength={20}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={inputStyle}
            />
            <button onClick={onCreateRoom} disabled={loading} className="btn-primary" style={{ padding: 12, fontSize: 15 }}>
              {loading ? "Please wait…" : "Create room"}
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="Room code"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && onJoinRoom()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={onJoinRoom} disabled={loading} className="btn-secondary" style={{ padding: "0 18px" }}>
                Join
              </button>
            </div>

          </>
        )}

        {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 14 }}>{error}</p>}
      </div>
    </div>
  );
}
