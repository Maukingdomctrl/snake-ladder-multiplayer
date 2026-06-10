import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/index";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  subscribeRoom,
  startGame,
  rollDice,
  subscribeMessages,
  getInstanceRoom,
  Room,
} from "../firebase/rooms";
import { usePlayerStorage } from "../hooks/usePlayerStorage";
import { useGameSync } from "../hooks/useGameSync";
import DiscordLayout from "./DiscordLayout";
import DiscordLobby from "./DiscordLobby";
import DiscordGameView from "./DiscordGameView";
import Chat from "../components/Chat";
import CountdownCard from "../components/CountdownCard";

export type Message = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  at: any;
};

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
  const [messages, setMessages] = useState<Message[]>([]);

  // ── Refs ──
  const joinedRef = useRef<boolean>(false);
  const prevRoomRef = useRef<Room | null>(null);
  const lastProcessedMoveRef = useRef<string>("");
  const diceFinishedRef = useRef<boolean>(false);
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Discord Auto-Join ──
  useEffect(() => {
    const instanceId = new URLSearchParams(window.location.search).get("instance_id");
    
    // Gate on resolved identity and prevent double-runs
    if (!instanceId || !playerId || joinedRef.current) {
      if (!instanceId) setDiscordReady(true);
      return;
    }

    joinedRef.current = true;

    async function autoJoin() {
      try {
        // Cold-start timeout: Render free tier can take 30s+ to wake up
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Server is waking up (this can take 30s). Please refresh and try again.")), 30000)
        );

        const joinTask = async () => {
          const existingRoomId = await getInstanceRoom(instanceId!);
          if (existingRoomId) {
            await joinRoom(existingRoomId, playerId, playerName || playerId, playerColor);
            setActiveRoomId(existingRoomId);
          } else {
            // Pass instanceId directly so the server claims it atomically
            const newRoomId = await createRoom(playerId, playerName || playerId, playerColor, instanceId!);
            setActiveRoomId(newRoomId);
          }
        };

        await Promise.race([joinTask(), timeout]);
      } catch (e: any) {
        setError(e.message || "Failed to connect");
        joinedRef.current = false; // Reset to allow retry if it was a transient error
      } finally {
        setDiscordReady(true);
      }
    }

    autoJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, playerName]); // Removed playerColor to prevent re-join firing on color pick

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
      if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
      if (rollCompleteTimeoutRef.current) clearTimeout(rollCompleteTimeoutRef.current);
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
    if (rollCompleteTimeoutRef.current) clearTimeout(rollCompleteTimeoutRef.current);
    rollCompleteTimeoutRef.current = setTimeout(() => setDiceComplete(true), 2000);
  };

  const onPickColor = async (color: string) => {
    const prevColor = playerColor;
    setPlayerColor(color); // Optimistic UI update

    if (activeRoomId) {
      try {
        await updateDoc(doc(db, "rooms", activeRoomId), {
          [`playerColors.${playerId}`]: color,
        });
      } catch (err: any) {
        console.error("Failed to update color:", err);
        setPlayerColor(prevColor); // Rollback on failure
        setError(err.message || "Failed to update color. Please try again.");
      }
    }
  };

  const onStartGame = async () => {
    if (!activeRoomId) return;
    setError("");
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
    setError("");
    setLoading(true);
    try {
      await rollDice(activeRoomId, playerId);
    } catch (e: any) {
      setError(e.message || "Failed to roll dice");
    } finally {
      setLoading(false);
    }
  };

  const onLeaveRoom = async () => {
    if (activeRoomId && playerId) {
      try {
        await leaveRoom(activeRoomId, playerId);
      } catch (e) {
        console.error("Failed to cleanly leave room metadata:", e);
      }
    }
    setActiveRoomId("");
    setRoomData(null);
    joinedRef.current = false;
  };

  // ── Render ──
  return (
    <DiscordLayout>
      {/* Connecting screen */}
      {!discordReady && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#5a5040", gap: 8 }}>
          <div style={{ fontSize: 16 }}>Connecting...</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>(Servers may take a moment to wake up)</div>
        </div>
      )}

      {/* Critical Error screen (No active room) */}
      {discordReady && error && !activeRoomId && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fa777c", gap: 12, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: "bold" }}>{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: "8px 16px", background: "#fa777c", color: "#111", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Game Area */}
      {discordReady && roomData && (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
            
            {/* Active Game Error Banner (Displays when room is active but an action failed) */}
            {error && (
              <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "#fa777c", color: "#111114", padding: "8px 16px", borderRadius: 6, zIndex: 100, fontSize: 14, fontWeight: "bold", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
                <span>{error}</span>
                <button onClick={() => setError("")} style={{ background: "transparent", border: "none", color: "#111114", cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>
              </div>
            )}

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