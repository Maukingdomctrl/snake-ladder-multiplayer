interface LoginScreenProps {
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  joinId: string;
  setJoinId: (id: string) => void;
  error: string;
  loading: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export default function LoginScreen({
  playerId,
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 16 }}>
      <div
        style={{
          background: "var(--bg-primary)",
          padding: "32px 24px",
          borderRadius: 16,
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🐍</div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px 0", color: "var(--text-primary)", fontWeight: 800, letterSpacing: -0.5 }}>
            Snakes & Ladders
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Player ID: {playerId}</p>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            placeholder="Enter your name (e.g. Mau)"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreateRoom();
            }}
            style={{
              fontSize: 15,
              padding: "12px 16px",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              width: "100%",
              outline: "none",
            }}
          />

          <button onClick={onCreateRoom} disabled={loading} className="btn-primary" style={{ width: "100%", padding: "12px", fontSize: 16 }}>
            {loading ? "Please wait..." : "Create New Room"}
          </button>
        </div>

        <div style={{ width: "100%", display: "flex", alignItems: "center", margin: "24px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ padding: "0 12px", color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <div style={{ width: "100%", display: "flex", gap: 8 }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={4}
            placeholder="4-digit code"
            value={joinId}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setJoinId(val);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onJoinRoom();
            }}
            style={{
              fontSize: 15,
              padding: "12px 16px",
              flex: 1,
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              outline: "none",
              minWidth: 0,
            }}
          />
          <button onClick={onJoinRoom} disabled={loading} className="btn-primary" style={{ padding: "0 20px", whiteSpace: "nowrap" }}>
            Join Room
          </button>
        </div>

        {error && <p style={{ color: "var(--danger)", margin: "16px 0 0 0", fontSize: 14 }}>{error}</p>}
      </div>
    </div>
  );
}