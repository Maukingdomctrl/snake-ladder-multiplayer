// src/discord-activity/DiscordGameView.tsx

import { useRef, useState, useEffect } from "react";
import type { Room } from "../firebase/rooms";
import Board from "../components/Board";
import DiceRow from "../components/DiceRow";

interface DiscordGameViewProps {
  roomData: Room;
  playerId: string;
  displayPositions: Record<string, number>;
  activeRoomId: string;
  diceComplete: boolean;
  jumpMessage: string;
  loading: boolean;
  onRollDice: () => void;
  onRollComplete: () => void;
  onLeaveRoom: () => void;
  onStartGame: () => void;
}

export default function DiscordGameView({
  roomData,
  playerId,
  displayPositions,
  activeRoomId,
  diceComplete,
  jumpMessage,
  loading,
  onRollDice,
  onRollComplete,
  onLeaveRoom,
  onStartGame,
}: DiscordGameViewProps) {
  const getName = (pid: string) => roomData.playerNames?.[pid] || pid;
  const isMyTurn = roomData.status === "playing" && roomData.currentTurn === playerId;
  const currentTurnName = roomData.currentTurn ? getName(roomData.currentTurn) : "";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        padding: "8px 8px 4px 8px",
        gap: 6,
      }}
    >
      {/* Scoreboard strip */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          flexShrink: 0,
          paddingBottom: 2,
        }}
      >
        {[...(roomData.players || [])]
          .sort((a, b) => (roomData.positions?.[b] ?? 1) - (roomData.positions?.[a] ?? 1))
          .map((pid, rank) => {
            const isActive = roomData.currentTurn === pid && roomData.status === "playing";
            return (
              <div
                key={pid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  background: isActive ? "rgba(201,168,76,0.1)" : "#141210",
                  border: isActive ? "1px solid #c9a84c" : "1px solid #1e1c1a",
                  borderRadius: 8,
                  padding: "4px 10px",
                  transition: "all 0.3s ease",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: "#5a5040", minWidth: 12 }}>
                  #{rank + 1}
                </span>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: roomData.playerColors?.[pid] || "#ccc",
                    flexShrink: 0,
                    boxShadow: isActive ? "0 0 0 2px #c9a84c" : "none",
                  }}
                />
                <div>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#d4c4a8", lineHeight: 1.2 }}>
                    {getName(pid)}{pid === playerId ? " (You)" : ""}{pid === roomData.winnerId ? " 🏆" : ""}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: "#5a5040", lineHeight: 1.2 }}>
                    Sq. {roomData.positions?.[pid] ?? 1}
                  </p>
                </div>
              </div>
            );
          })}
      </div>

      {/* Turn indicator */}
      {roomData.status === "playing" && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#c9a84c",
            borderLeft: "2px solid #c9a84c",
            paddingLeft: 8,
            flexShrink: 0,
            letterSpacing: 0.5,
          }}
        >
          {currentTurnName}'s turn {roomData.currentTurn === playerId ? "(You)" : ""}
        </div>
      )}

      {/* Board */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {roomData.positions && (
          <Board
            key={activeRoomId}
            positions={displayPositions}
            playerNames={roomData.playerNames || {}}
            roomData={roomData}
            hideLegend={true}
            diceComplete={diceComplete}
          />
        )}
      </div>

      {/* Dice row */}
      {roomData.status === "playing" && (
        <div style={{ flexShrink: 0 }}>
          <DiceRow
            onRoll={onRollDice}
            disabled={loading || !isMyTurn}
            lastDice={roomData.lastDice ?? null}
            rollKey={`${roomData.lastRolledBy}-${(roomData.updatedAt as any)?.seconds}`}
            jumpMessage={jumpMessage}
            onRollComplete={onRollComplete}
          />
        </div>
      )}

      {/* Winner overlay */}
      {roomData.status === "finished" && roomData.winnerId && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#141210",
              border: "1px solid #2e2920",
              borderRadius: 12,
              padding: "32px 24px",
              textAlign: "center",
              maxWidth: 320,
              width: "100%",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
            <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#5a5040", textTransform: "uppercase", letterSpacing: 1 }}>Winner</p>
            <h2 style={{ margin: "0 0 24px 0", fontSize: 28, fontWeight: 800, color: "#c9a84c" }}>
              {getName(roomData.winnerId)}
            </h2>
            <div style={{ display: "flex", gap: 10 }}>
              {roomData.hostId === playerId ? (
                <button
                  onClick={async () => { try { await onStartGame(); } catch (_) {} }}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "linear-gradient(135deg, #c9a84c, #a07830)",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#1a1200",
                    cursor: "pointer",
                  }}
                >
                  Play Again
                </button>
              ) : (
                <div
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "#1a1814",
                    border: "1px solid #2e2920",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "#5a5040",
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a84c", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                  Waiting for host...
                </div>
              )}
              <button
                onClick={onLeaveRoom}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#1a1814",
                  border: "1px solid #2e2920",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#8b7d65",
                  cursor: "pointer",
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}