// src/discord-activity/DiscordLobby.tsx

import { LOBBY_COLORS } from "../constants";
import type { Room } from "../firebase/rooms";

interface DiscordLobbyProps {
  roomData: Room;
  playerId: string;
  playerColor: string;
  loading: boolean;
  onPickColor: (color: string) => void;
  onStartGame: () => void;
}

export default function DiscordLobby({
  roomData,
  playerId,
  playerColor,
  loading,
  onPickColor,
  onStartGame,
}: DiscordLobbyProps) {
  const getName = (pid: string) => roomData.playerNames?.[pid] || pid;
  const takenColors = Object.values(roomData.playerColors || {}) as string[];
  const isHost = roomData.hostId === playerId;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "12px 16px",
        gap: 10,
        overflowY: "auto",
        minHeight: 0,
      }}
    >
      {/* Title */}
      <p
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 700,
          color: "#c9a84c",
          letterSpacing: 1,
          textAlign: "center",
        }}
      >
        The Tavern
      </p>

      {/* Status row */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ background: "#1a1814", border: "1px solid #2e2920", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#8b7d65" }}>
          <b style={{ color: "#c9a84c", fontWeight: 500 }}>Host:</b> {getName(roomData.hostId)}
        </div>
        <div style={{ background: "#1a1814", border: "1px solid #2e2920", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#8b7d65" }}>
          <b style={{ color: "#c9a84c", fontWeight: 500 }}>Players:</b> {roomData.players?.length ?? 0}/8
        </div>
      </div>

      {/* Player list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {roomData.players?.map((pid: string) => (
          <div
            key={pid}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#141210",
              border: "1px solid #1e1c1a",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: roomData.playerColors?.[pid] || "#ccc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 12,
                color: "#000",
                flexShrink: 0,
              }}
            >
              {(roomData.playerNames?.[pid] || pid).charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#d4c4a8", flex: 1 }}>
              {roomData.playerNames?.[pid] || pid}
            </span>
            {pid === roomData.hostId && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#c9a84c",
                  background: "rgba(201,168,76,0.1)",
                  border: "1px solid rgba(201,168,76,0.25)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  letterSpacing: 0.5,
                }}
              >
                HOST
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Color picker */}
      <div>
        <p style={{ margin: "0 0 8px 0", fontSize: 11, color: "#5a5040", textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
          Choose your crest
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {LOBBY_COLORS.map((c) => {
            const taken = takenColors.includes(c) && roomData.playerColors?.[playerId] !== c;
            return (
              <div
                key={c}
                onClick={() => !taken && onPickColor(c)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: c,
                  border: playerColor === c ? "3px solid #c9a84c" : "2px solid rgba(255,255,255,0.15)",
                  opacity: taken ? 0.3 : 1,
                  cursor: taken ? "not-allowed" : "pointer",
                  transform: playerColor === c ? "scale(1.15)" : "none",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Start / Wait */}
      {isHost ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            onClick={onStartGame}
            disabled={loading || (roomData.players?.length ?? 0) < 2}
            style={{
              background: (roomData.players?.length ?? 0) < 2 ? "#1a1814" : "linear-gradient(135deg, #c9a84c, #a07830)",
              border: "none",
              borderRadius: 6,
              padding: "10px",
              fontSize: 13,
              fontWeight: 700,
              color: (roomData.players?.length ?? 0) < 2 ? "#5a5040" : "#1a1200",
              cursor: (roomData.players?.length ?? 0) < 2 ? "not-allowed" : "pointer",
              width: "100%",
              letterSpacing: 0.5,
            }}
          >
            {loading ? "Starting..." : "Start Game"}
          </button>
          {(roomData.players?.length ?? 0) < 2 && (
            <p style={{ margin: 0, fontSize: 11, color: "#5a5040", textAlign: "center" }}>
              Need at least 2 players
            </p>
          )}
        </div>
      ) : (
        <div
          style={{
            background: "#141210",
            border: "1px solid #1e1c1a",
            borderRadius: 6,
            padding: "10px",
            textAlign: "center",
            fontSize: 12,
            color: "#5a5040",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#c9a84c",
              display: "inline-block",
              animation: "pulse 1.5s infinite",
            }}
          />
          Waiting for host...
        </div>
      )}
    </div>
  );
}