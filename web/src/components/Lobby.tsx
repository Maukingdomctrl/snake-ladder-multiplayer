import { Room } from "../firebase/rooms";
import { LOBBY_COLORS } from "../constants";

interface LobbyProps {
  roomData: Room;
  playerId: string;
  activeRoomId: string;
  playerColor: string;
  loading: boolean;
  copied: boolean;
  setCopied: (val: boolean) => void;
  onPickColor: (color: string) => void;
  onStartGame: () => void;
  isCompact?: boolean;
}

export default function DiscordLobby({
  roomData,
  playerId,
  activeRoomId,
  playerColor,
  loading,
  copied,
  setCopied,
  onPickColor,
  onStartGame,
  isCompact,
}: LobbyProps) {
  const getName = (pid: string) => roomData.playerNames?.[pid] || pid;
  const takenColors = Object.values(roomData.playerColors || {}) as string[];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, width: "100%", padding: 16 }}>
      <div
        style={{
          background: "var(--bg-primary)",
          padding: isCompact ? "16px 12px" : "32px 24px",
          borderRadius: 16,
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: isCompact ? "0 0 8px 0" : "0 0 16px 0", color: "var(--text-primary)", fontSize: 22 }}>The Kingdom</h2>

        <div style={{ display: "flex", gap: 12, marginBottom: isCompact ? 12 : 24, fontSize: 13, color: "var(--text-secondary)" }}>
          <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
            <b style={{ color: "var(--text-primary)" }}>Status:</b> Waiting
          </span>
          <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
            <b style={{ color: "var(--text-primary)" }}>Host:</b> {getName(roomData.hostId)}
          </span>
        </div>

        {!isCompact && (
          <div style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16, width: "100%" }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Room Code</p>
              <p style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: 8, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{activeRoomId}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(activeRoomId);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
        )}

        <div style={{ width: "100%", marginBottom: isCompact ? 8 : 16 }}>
          <p style={{ margin: isCompact ? "0 0 6px 0" : "0 0 10px 0", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>
            Players — {roomData.players?.length ?? 0}/8
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {roomData.players?.map((pid: string) => (
              <div key={pid} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-input)", borderRadius: 8, padding: "8px 12px", border: "1px solid var(--border)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: roomData.playerColors?.[pid] || "#ccc", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0 }}>
                  {(roomData.playerNames?.[pid] || pid).charAt(0).toUpperCase()}
                </div>
                <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{roomData.playerNames?.[pid] || pid}</span>
                {pid === roomData.hostId && (
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "rgba(35,165,89,0.12)", padding: "2px 8px", borderRadius: 10 }}>HOST</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: "100%", marginBottom: isCompact ? 8 : 16 }}>
          <p style={{ margin: "0 0 16px 0", color: "var(--text-primary)", fontWeight: 600, fontSize: 15 }}>Pick your color:</p>
          <div style={{ display: "flex", gap: isCompact ? 8 : 12, flexWrap: "wrap", justifyContent: "center" }}>
            {LOBBY_COLORS.map((c) => {
              const taken = takenColors.includes(c) && roomData?.playerColors?.[playerId] !== c;
              return (
                <div
                  key={c}
                  onClick={() => !taken && onPickColor(c)}
                  style={{
                    width: isCompact ? 34 : 44,
                    height: isCompact ? 34 : 44,
                    borderRadius: "50%",
                    background: c,
                    border: playerColor === c ? "4px solid #fff" : "2px solid rgba(255,255,255,0.2)",
                    opacity: taken ? 0.3 : 1,
                    cursor: taken ? "not-allowed" : "pointer",
                    boxShadow: playerColor === c ? "var(--shadow-md)" : "none",
                    transform: playerColor === c ? "scale(1.15)" : "none",
                    transition: "all 0.2s ease",
                  }}
                  title={taken ? "Taken" : "Available"}
                />
              );
            })}
          </div>
        </div>

        {roomData.hostId === playerId ? (
          <>
            <button
              onClick={onStartGame}
              disabled={loading || (roomData.players?.length ?? 0) < 2}
              className="btn-primary"
              style={{ width: "100%", padding: "14px", fontSize: 16 }}
            >
              Start Game
            </button>
            {/* The 2-player text requirement block has been completely removed from here! */}
          </>
        ) : (
          <div style={{ width: "100%", padding: "14px", background: "var(--bg-tertiary)", borderRadius: 8, color: "var(--text-muted)", fontSize: 15, border: "1px solid var(--border)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1.5s infinite" }} />
            Waiting for host to start...
          </div>
        )}
      </div>
    </div>
  );
}