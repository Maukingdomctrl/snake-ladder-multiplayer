interface LoginScreenProps {
  authReady: boolean;
  userEmail: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function LoginScreen({
  authReady,
  userEmail,
  onSignIn,
  onSignOut,
  playerName,
  setPlayerName,
  joinId,
  setJoinId,
  error,
  loading,
  onCreateRoom,
  onJoinRoom,
}: LoginScreenProps) {
  const signedIn = !!userEmail;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14, textAlign: "center" }}>
        <h1 style={{ fontSize: 26, margin: 0, color: "var(--text-primary)", fontWeight: 800, letterSpacing: -0.5 }}>
          Snakes &amp; Ladders
        </h1>

        {!authReady ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Loading…</p>
        ) : !signedIn ? (
          <>
            <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>Sign in to create or join a game.</p>
            <button onClick={onSignIn} className="btn-google">
              <GoogleMark /> Continue with Google
            </button>
          </>
        ) : (
          <>
            <input
              placeholder="Your name"
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

            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              {userEmail} ·{" "}
              <button onClick={onSignOut} className="link-btn">
                Sign out
              </button>
            </p>
          </>
        )}

        {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 14 }}>{error}</p>}
      </div>
    </div>
  );
}
