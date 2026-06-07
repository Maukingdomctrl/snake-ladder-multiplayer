import { LOBBY_COLORS } from "../constants";

interface WinnerOverlayProps {
  winnerName: string;
  isHost: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export default function WinnerOverlay({ winnerName, isHost, onPlayAgain, onLeave }: WinnerOverlayProps) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {LOBBY_COLORS.concat(["#fff", "#f59e0b", "#60a5fa", "#34d399"]).map((c, i) => (
        <div key={i} style={{
          position: "absolute", width: i % 3 === 0 ? 12 : 8, height: i % 3 === 0 ? 12 : 8,
          borderRadius: i % 2 === 0 ? "50%" : "2px", background: c,
          left: `${5 + i * 8}%`, top: `${5 + (i % 4) * 8}%`,
          animation: `confetti-fall ${1.0 + i * 0.15}s ease-in ${i * 0.08}s infinite`,
        }} />
      ))}
      <div style={{ background: "var(--bg-primary)", borderRadius: 20, padding: "48px 40px", maxWidth: 400, width: "100%", textAlign: "center", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>
        <p style={{ margin: "0 0 4px 0", fontSize: 13, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Winner</p>
        <h2 style={{ margin: "0 0 32px 0", fontSize: 36, fontWeight: 800, color: "var(--accent)" }}>{winnerName}</h2>
        <div style={{ display: "flex", gap: 12 }}>
          {isHost ? (
            <button className="btn-primary" style={{ flex: 1, padding: "14px" }} onClick={onPlayAgain}>
              Play Again
            </button>
          ) : (
            <div style={{ flex: 1, padding: "14px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)", fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse 1.5s infinite" }} />
              Waiting for host...
            </div>
          )}
          <button
            onClick={onLeave}
            style={{ flex: 1, padding: "14px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}