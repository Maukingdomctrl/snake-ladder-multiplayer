// src/discord-activity/DiscordApp.tsx

import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/index";
import {
  createRoom,
  joinRoom,
  subscribeRoom,
  startGame,
  rollDice,
  subscribeMessages,
  getInstanceRoom,
  setInstanceRoom,
  Room,
} from "../firebase/rooms";
import { usePlayerStorage } from "../hooks/usePlayerStorage";
import { useGameSync } from "../hooks/useGameSync";
import DiscordLayout from "./DiscordLayout";
import DiscordLobby from "./DiscordLobby";
import DiscordGameView from "./DiscordGameView"; // <-- Changed to default import
import Chat from "../components/Chat";
import CountdownCard from "../components/CountdownCard";

export default function DiscordApp() {
  const { playerId, playerName, playerColor, setPlayerColor } = usePlayerStorage();

  // ── Local UI State ──
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [discordReady, setDiscordReady] = useState<boolean>(false);

  // ── Game State ──
  const [roomData, setRoomData] = useState<Room | null>(null);
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>({});
  const [jumpMessage, setJumpMessage] = useState<string>("");
  const [diceComplete, setDiceComplete] = useState<boolean>(false);
  const { countdown } = useGameSync(roomData);

  // ── Chat State ──
  const [messages, setMessages] = useState<any[]>([]);

  // ── Refs ──
  const prevRoomRef = useRef<Room | null>(null);
  const lastProcessedMoveRef = useRef<string>("");
  const diceFinishedRef = useRef<boolean>(false);
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Discord Auto-Join ──
  useEffect(() => {
    const instanceId = new URLSearchParams(window.location.search).get("instance_id");
    if (!instanceId) {
      setDiscordReady(true);
      return;
    }

    async function autoJoin() {
      try {
        const existingRoomId = await getInstanceRoom(instanceId!);
        if (existingRoomId) {
          await joinRoom(existingRoomId, playerId, playerName || playerId, playerColor);
          setActiveRoomId(existingRoomId);
        } else {
          const newRoomId = await createRoom(playerId, playerName || playerId, playerColor);
          await setInstanceRoom(instanceId!, newRoomId);
          setActiveRoomId(newRoomId);
        }
      } catch (e: any) {
        setError(e.message || "Failed to connect");
      } finally {
        setDiscordReady(true);
      }
    }

    autoJoin();
  }, []);

  // ── Firestore Subscriptions ──
  useEffect(() => {
    if (!activeRoomId) return;

    setJumpMessage("");
    prevRoomRef.current = null;
    lastProcessedMoveRef.current = "";
    setDisplayPositions({});

    const unsub = subscribeRoom(activeRoomId, (room: Room | null) => {
      setRoomData(room);
    });
    const unsubMessages = subscribeMessages(activeRoomId, setMessages);

    return () => {
      if (typeof unsub === "function") unsub();
      if (typeof unsubMessages === "function") unsubMessages();
    };
  }, [activeRoomId]);

  // ── Room Data Sync ──
  useEffect(() => {
    if (!roomData) return;
    const prev = prevRoomRef.current;

    if (roomData.positions) {
      setDisplayPositions(roomData.positions);
    }

    if (prev && roomData.lastDice != null && roomData.lastRolledBy && roomData.positions && prev.positions) {
      const ts: any = roomData.updatedAt;
      const moveKey = `${roomData.lastRolledBy}|${roomData.lastDice}|${ts?.seconds ?? ""}|${ts?.nanoseconds ?? ""}`;

      if (lastProcessedMoveRef.current !== moveKey) {
        diceFinishedRef.current = false;
        setDiceComplete(false);

        if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
        observerTimeoutRef.current = setTimeout(() => {
          if (!diceFinishedRef.current) {
            diceFinishedRef.current = true;
            setDiceComplete(true);
          }
        }, 4000);

        const pid = roomData.lastRolledBy;
        const from = roomData.lastFrom ?? 1;
        const to = roomData.positions?.[pid] ?? from;
        const movedTo = Math.min(100, from + roomData.lastDice);

        if (to > movedTo) setJumpMessage(`🪜 Ladder! ${movedTo} → ${to}`);
        else if (to < movedTo) setJumpMessage(`🐍 Snake! ${movedTo} → ${to}`);
        else setJumpMessage("");

        lastProcessedMoveRef.current = moveKey;
      }
    }

    prevRoomRef.current = roomData;
  }, [roomData]);

  // ── Callbacks ──
  const handleRollComplete = () => {
    diceFinishedRef.current = true;
    setTimeout(() => setDiceComplete(true), 2000);
  };

  const onPickColor = async (color: string) => {
    setPlayerColor(color);
    if (activeRoomId) {
      try {
        await updateDoc(doc(db, "rooms", activeRoomId), {
          [`playerColors.${playerId}`]: color,
        });
      } catch (err) {
        console.error("Failed to update color:", err);
      }
    }
  };

  const onStartGame = async () => {
    if (!activeRoomId) return;
    setLoading(true);
    try {
      await startGame(activeRoomId, playerId);
    } catch (e: any) {
      setError(e.message || "Failed to start game");
    } finally {
      setLoading(false);
    }
  };

  const onRollDice = async () => {
    if (!activeRoomId) return;
    setLoading(true);
    try {
      await rollDice(activeRoomId, playerId);
    } catch (e: any) {
      setError(e.message || "Failed to roll dice");
    } finally {
      setLoading(false);
    }
  };

  const onLeaveRoom = () => {
    setActiveRoomId("");
    setRoomData(null);
  };

  // ── Render ──
  return (
    <DiscordLayout>
      {/* Connecting screen */}
      {!discordReady && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#5a5040", fontSize: 14 }}>
          Connecting...
        </div>
      )}

      {/* Error screen */}
      {discordReady && error && !activeRoomId && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fa777c", fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Game */}
      {discordReady && roomData && (
        <>
          {/* Left: game area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
            {roomData.status === "waiting" && (
              <DiscordLobby
                roomData={roomData}
                playerId={playerId}
                playerColor={playerColor}
                loading={loading}
                onPickColor={onPickColor}
                onStartGame={onStartGame}
              />
            )}

            {roomData.status === "countdown" && (
              <CountdownCard
                countdown={countdown}
                hostName={roomData.playerNames?.[roomData.hostId] || roomData.hostId}
              />
            )}

            {(roomData.status === "playing" || roomData.status === "finished") && (
              <DiscordGameView
                roomData={roomData}
                playerId={playerId}
                displayPositions={displayPositions}
                activeRoomId={activeRoomId}
                diceComplete={diceComplete}
                jumpMessage={jumpMessage}
                loading={loading}
                onRollDice={onRollDice}
                onRollComplete={handleRollComplete}
                onLeaveRoom={onLeaveRoom}
                onStartGame={onStartGame}
              />
            )}
          </div>

          {/* Right: chat */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              background: "#111114",
              borderLeft: "1px solid #1e1c1a",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 40, borderBottom: "1px solid #1e1c1a", display: "flex", alignItems: "center", padding: "0 14px", gap: 8, flexShrink: 0 }}>
              <span style={{ color: "#3a3530", fontSize: 18, fontWeight: 300 }}>#</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#8b7d65" }}>tavern-chat</span>
            </div>
            <Chat
              messages={messages}
              playerId={playerId}
              playerName={playerName}
              activeRoomId={activeRoomId}
              roomData={roomData}
            />
          </div>
        </>
      )}
    </DiscordLayout>
  );
}