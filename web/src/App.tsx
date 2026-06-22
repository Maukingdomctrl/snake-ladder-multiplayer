// web/src/App.tsx
import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase/index";
import "./App.css";

// ── Firebase & Data ──
import {
  createRoom,
  joinRoom,
  leaveRoom,
  subscribeRoom,
  startGame,
  rollDice,
  subscribeMessages,
  Room,
} from "./firebase/rooms";

// ── Hooks ──
import { usePlayerStorage } from "./hooks/usePlayerStorage";
import { useGameSync } from "./hooks/useGameSync";
import { useWindowDimensions } from "./hooks/useWindowDimensions";

// ── Components ──
import Board from "./components/Board";
import LoginScreen from "./components/LoginScreen";
import Lobby from "./components/Lobby";
import Chat from "./components/Chat";
import GameHeader from "./components/GameHeader";
import CountdownCard from "./components/CountdownCard";
import Scoreboard from "./components/Scoreboard";
import WinnerOverlay from "./components/WinnerOverlay";
import DiceRow from "./components/DiceRow";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

export default function App() {
  // ── Hook State ──
  const { playerId, playerName, setPlayerName, playerColor, setPlayerColor } = usePlayerStorage();
  const { width, height } = useWindowDimensions();
  
  // Single source of truth for layout derived from hook
  const isTablet = width >= 768;
  const isCompact = height < 700;

  // ── Local UI State ──
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [joinId, setJoinId] = useState<string>("");
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  // ── Game State ──
  const [roomData, setRoomData] = useState<Room | null>(null);
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>({});
  const [jumpMessage, setJumpMessage] = useState<string>("");
  const [diceComplete, setDiceComplete] = useState<boolean>(true);
  const { countdown } = useGameSync(roomData, playerId);

  // ── Chat State ──
  const [messages, setMessages] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState<boolean>(isTablet);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // ── Refs ──
  const prevRoomRef = useRef<Room | null>(null);
  const lastProcessedMoveRef = useRef<string>("");
  const prevMsgCountRef = useRef<number>(0);
  const isFirstMessageLoadRef = useRef<boolean>(true);
  const diceFinishedRef = useRef<boolean>(true); // FIX: Initialize to true to prevent buffering lock on join
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJumpMessageRef = useRef<string>("");
  const pendingPositionsRef = useRef<Record<string, number>>({});

  // ── Layout Listeners ──
  useEffect(() => {
    if (isTablet) {
      setChatOpen(true);
    } else {
      setChatOpen(false); // Fixes the stuck-open glitch when resizing tablet -> mobile
    }
  }, [isTablet]);

  // FIX: Clear observer timeout on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;

    if (isFirstMessageLoadRef.current) {
      isFirstMessageLoadRef.current = false;
    } else if (!chatOpen && !isTablet && messages.length > prevMsgCountRef.current) {
      const newMessages = messages.slice(prevMsgCountRef.current);
      const othersMessages = newMessages.filter((m) => m.playerId !== playerId);
      if (othersMessages.length > 0) {
        setUnreadCount((prev) => prev + othersMessages.length);
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, chatOpen, isTablet, playerId]);

  useEffect(() => {
    if (chatOpen || isTablet) setUnreadCount(0);
  }, [chatOpen, isTablet]);

  // ── Derived State ──
  const isMyTurn = roomData?.status === "playing" && roomData?.currentTurn === playerId && diceComplete;
  const getName = (pid: string) => roomData?.playerNames?.[pid] || pid;
  const displayTurnId = diceComplete ? roomData?.currentTurn : roomData?.lastRolledBy;
  const currentTurnName = displayTurnId ? getName(displayTurnId) : "";

  // ── Callbacks ──
  const handleRollComplete = () => {
    diceFinishedRef.current = true;
    if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current); 
    
    setDiceComplete(true);
    setJumpMessage(pendingJumpMessageRef.current);
    
    if (Object.keys(pendingPositionsRef.current).length > 0) {
      setDisplayPositions(pendingPositionsRef.current);
    }
    
    setLoading(false);
  };

  // ── Actions ──
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

  const onCreateRoom = async () => {
    if (!playerName.trim()) return setError("Please enter your name first");
    setLoading(true);
    setError("");
    try {
      const id = await createRoom(playerId, playerName.trim(), playerColor);
      setJoinId(id);
      setActiveRoomId(id);
    } catch (e: any) {
      setError(e.message || "Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  const onJoinRoom = async () => {
    setError("");
    const trimmedId = joinId.trim();
    if (trimmedId.length !== 4) return setError("Room code must be exactly 4 digits");
    if (!playerName.trim()) return setError("Please enter your name first");

    setLoading(true);
    try {
      await joinRoom(trimmedId, playerId, playerName.trim(), playerColor);
      setActiveRoomId(trimmedId);
    } catch (e: any) {
      setError(e.message || "Failed to join room");
    } finally {
      setLoading(false);
    }
  };

  const onStartGame = async () => {
    if (!activeRoomId) return;
    setLoading(true);
    setError("");
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
    setError("");
    try {
      await rollDice(activeRoomId, playerId);
    } catch (e: any) {
      setError(e.message || "Failed to roll dice");
      setLoading(false);
    }
  };

  const onLeaveRoom = async () => {
    setError("");
    setMessages([]);
    if (activeRoomId) {
      try {
        await leaveRoom(activeRoomId, playerId);
      } catch (err) {
        console.error("Failed to cleanly leave room:", err);
      }
    }
    setActiveRoomId("");
    setRoomData(null);
    setJoinId("");
  };

  // ── Firestore Sync & Position Logic ──
  useEffect(() => {
    if (!activeRoomId) return;

    setJumpMessage("");
    prevRoomRef.current = null;
    lastProcessedMoveRef.current = "";
    setDisplayPositions({});
    isFirstMessageLoadRef.current = true;
    prevMsgCountRef.current = 0;
    setUnreadCount(0); // Resets unread state on room switch
    
    setMessages([]);
    pendingJumpMessageRef.current = "";
    pendingPositionsRef.current = {};
    diceFinishedRef.current = true; // FIX: Ensure dice is marked as finished so positions apply immediately
    setDiceComplete(true);

    const unsub = subscribeRoom(activeRoomId, (room: Room | null) => {
      setRoomData(room);
    });
    const unsubMessages = subscribeMessages(activeRoomId, setMessages);

    return () => {
      if (typeof unsub === "function") unsub();
      if (typeof unsubMessages === "function") unsubMessages();
      if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
    };
  }, [activeRoomId]);

  useEffect(() => {
    if (!roomData) return;
    const prev = prevRoomRef.current;
    
    // FIX: Initialize state properly on first room load to prevent false 'new roll' detection
    if (!prev) {
      prevRoomRef.current = roomData;
      const moveKey = String(roomData.moveCount ?? 0);
      lastProcessedMoveRef.current = moveKey;
      
      if (roomData.positions) {
        setDisplayPositions(roomData.positions);
        pendingPositionsRef.current = roomData.positions;
      }
      return;
    }

    let isNewRoll = false;

    // 1. Detect if this update is a new roll FIRST
    if (
      roomData.lastDice != null &&
      roomData.lastRolledBy &&
      roomData.positions &&
      prev.positions
    ) {
      const moveKey = String(roomData.moveCount ?? 0);

      if (lastProcessedMoveRef.current !== moveKey) {
        // FIX: Force flush previous pending state if a new roll arrives before the previous animation finished
        if (!diceFinishedRef.current) {
          if (Object.keys(pendingPositionsRef.current).length > 0) {
            setDisplayPositions(pendingPositionsRef.current);
          }
          setJumpMessage(pendingJumpMessageRef.current);
        }

        isNewRoll = true;
        diceFinishedRef.current = false;
        setDiceComplete(false);
        setJumpMessage("");

        if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
        observerTimeoutRef.current = setTimeout(() => {
          if (!diceFinishedRef.current) {
            diceFinishedRef.current = true;
            setDiceComplete(true);
            setLoading(false);
            setJumpMessage(pendingJumpMessageRef.current);
            if (Object.keys(pendingPositionsRef.current).length > 0) {
              setDisplayPositions(pendingPositionsRef.current);
            }
          }
        }, 5000);

        const pid = roomData.lastRolledBy;
        const from = roomData.lastFrom; // FIX: Don't default to 1, it causes false jump messages
        const to = roomData.positions?.[pid] ?? from;
        const movedTo = Math.min(100, (from ?? 1) + roomData.lastDice);

        if (from != null) { // FIX: Only evaluate jump if `from` is known
          if (to > movedTo) {
            pendingJumpMessageRef.current = `🪜 Ladder! ${movedTo} → ${to}`;
          } else if (to < movedTo && to !== from) { 
            pendingJumpMessageRef.current = `🐍 Snake! ${movedTo} → ${to}`;
          } else {
            pendingJumpMessageRef.current = "";
          }
        } else {
          pendingJumpMessageRef.current = "";
        }

        lastProcessedMoveRef.current = moveKey;
      }
    }

    // 2. Buffer or Apply positions based on the refs/flags, NOT React state
    if (roomData.positions) {
      if (isNewRoll || !diceFinishedRef.current) {
        pendingPositionsRef.current = roomData.positions;
      } else {
        setDisplayPositions(roomData.positions);
        pendingPositionsRef.current = roomData.positions;
      }
    }

    prevRoomRef.current = roomData;
  }, [roomData]);

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        minHeight: "100dvh",
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        color: "var(--text-primary)",
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      <div
        style={{
          maxWidth: isTablet ? "1400px" : "100%",
          width: "100%",
          margin: "0 auto",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          paddingTop: "max(0px, env(safe-area-inset-top))",
          paddingLeft: "max(12px, env(safe-area-inset-left))",
          paddingRight: "max(12px, env(safe-area-inset-right))",
        }}
      >
        {/* ── LOGIN SCREEN ── */}
        {!activeRoomId && (
          <LoginScreen
            playerId={playerId}
            playerName={playerName}
            setPlayerName={setPlayerName}
            joinId={joinId}
            setJoinId={setJoinId}
            error={error}
            loading={loading}
            onCreateRoom={onCreateRoom}
            onJoinRoom={onJoinRoom}
          />
        )}

        {/* ── LOADING ROOM ── */}
        {activeRoomId && !roomData && (
          <div style={{ flex: 1, display: "flex", alignItems: "center",
            justifyContent: "center", color: "var(--text-muted)", fontSize: 15 }}>
            Loading room...
          </div>
        )}

        {/* ── MAIN GAME VIEW ── */}
        {roomData && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* In-game error banner */}
            {error && (
              <div style={{
                position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
                background: "var(--danger)", color: "#fff", padding: "8px 16px",
                borderRadius: 6, zIndex: 1000, fontSize: 14, fontWeight: 600,
                display: "flex", gap: 12, alignItems: "center",
                boxShadow: "var(--shadow-lg)"
              }}>
                <span>{error}</span>
                <button onClick={() => setError("")} style={{
                  background: "transparent", border: "none", color: "#fff",
                  cursor: "pointer", fontSize: 16, padding: 0
                }}>✕</button>
              </div>
            )}

            {/* Header */}
            {!isCompact && (
              <GameHeader
                roomId={roomData.id!}
                players={roomData.players}
                playerColors={roomData.playerColors || {}}
                playerNames={roomData.playerNames || {}}
                isTablet={isTablet}
              />
            )}

            <div
              style={{
                display: "flex",
                flexDirection: isTablet ? "row" : "column",
                flex: 1,
                minHeight: 0,
                gap: 16,
                alignItems: "flex-start",
                overflow: "hidden",
              }}
            >
              {/* LEFT COLUMN: PLAY AREA / LOBBY */}
              <div
                className="game-column"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  overflowY: "auto",
                  scrollbarGutter: "stable",
                  paddingRight: 8,
                  paddingBottom: !isTablet ? 68 : 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 12,
                  position: "relative",
                }}
              >
                {/* ── STATE 1: WAITING LOBBY ── */}
                {roomData.status === "waiting" && (
                  <Lobby
                    roomData={roomData}
                    playerId={playerId}
                    activeRoomId={activeRoomId}
                    playerColor={playerColor}
                    loading={loading}
                    copied={copied}
                    setCopied={setCopied}
                    onPickColor={onPickColor}
                    onStartGame={onStartGame}
                    isCompact={isCompact}
                  />
                )}

                {/* ── STATE 2: COUNTDOWN CARD ── */}
                {roomData.status === "countdown" && (
                  <CountdownCard
                    countdown={countdown}
                    hostName={getName(roomData.hostId)}
                  />
                )}

                {/* ── STATE 3: ACTIVE GAME (Playing or Finished) ── */}
                {(roomData.status === "playing" || roomData.status === "finished") && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: "100%",
                      padding: "0 8px",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 16,
                      }}
                    >
                      {roomData.status === "playing" ? (
                        <div className="turn-indicator">
                          It's {currentTurnName}'s turn{" "}
                          {roomData.currentTurn === playerId ? "(You)" : ""}
                        </div>
                      ) : (
                        <div />
                      )}

                      {roomData.status === "finished" && (
                        <div
                          style={{
                            background: "var(--bg-tertiary)",
                            borderRadius: 8,
                            padding: "8px 12px",
                            fontSize: 13,
                            color: "var(--text-secondary)",
                            display: "flex",
                            gap: 16,
                            boxShadow: "var(--shadow-sm)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <span>
                            <b style={{ color: "var(--text-primary)" }}>Status:</b>{" "}
                            {roomData.status}
                          </span>
                          <span>
                            <b style={{ color: "var(--text-primary)" }}>Host:</b>{" "}
                            {getName(roomData.hostId)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Scoreboard */}
                    {roomData.positions && (
                      <Scoreboard
                        players={roomData.players}
                        positions={roomData.positions}
                        playerColors={roomData.playerColors || {}}
                        playerNames={roomData.playerNames || {}}
                        currentTurn={roomData.currentTurn}
                        status={roomData.status}
                        winnerId={roomData.winnerId ?? null}
                        playerId={playerId}
                        lastDice={roomData.lastDice ?? null}
                        lastRolledBy={roomData.lastRolledBy ?? null}
                      />
                    )}

                    {/* The Board */}
                    {roomData.positions && (
                      <div
                        style={{
                          paddingBottom: 16,
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        <Board
                          key={activeRoomId}
                          positions={displayPositions}
                          playerNames={roomData?.playerNames || {}}
                          roomData={roomData}
                          hideLegend={true}
                          diceComplete={diceComplete}
                        />
                      </div>
                    )}

                    {/* Winner overlay */}
                    {roomData.status === "finished" && roomData.winnerId && diceComplete && (
                      <WinnerOverlay
                        winnerName={getName(roomData.winnerId)}
                        isHost={roomData.hostId === playerId}
                        onPlayAgain={async () => {
                          setError("");
                          try {
                            await startGame(activeRoomId, playerId);
                          } catch (e: any) {
                            setError(e.message || "Failed to restart game");
                          }
                        }}
                        onLeave={onLeaveRoom}
                      />
                    )}

                    {/* Dice row */}
                    {roomData.status === "playing" && (
                      <DiceRow
                        onRoll={onRollDice}
                        disabled={!isMyTurn || loading}
                        lastDice={(roomData.lastDice as Face) ?? null}
                        rollKey={String(roomData.moveCount ?? 0)}
                        jumpMessage={jumpMessage}
                        onRollComplete={handleRollComplete}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: TABLET CHAT */}
              {isTablet && (
                <div
                  style={{
                    width: 320,
                    flexShrink: 0,
                    backgroundColor: "var(--bg-primary)",
                    borderRadius: 8,
                    padding: "16px 8px 8px 8px",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    maxHeight: "100%",
                    overflow: "hidden",
                    boxShadow: "var(--shadow-md)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 12,
                      paddingLeft: 8,
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", fontSize: 20 }}>#</span>
                    <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: 16 }}>
                      chat
                    </h3>
                  </div>
                  <Chat
                    messages={messages}
                    playerId={playerId}
                    playerName={playerName}
                    activeRoomId={activeRoomId}
                    roomData={roomData}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* MOBILE CHAT: FLOATING ACTION BUTTON */}
        {!isTablet && activeRoomId && !chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            style={{
              position: "fixed",
              bottom: "max(24px, env(safe-area-inset-bottom))",
              right: 24,
              minHeight: 56,
              minWidth: 56,
              borderRadius: "50%",
              backgroundColor: "var(--accent)",
              color: "white",
              fontSize: 24,
              zIndex: 900,
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "1px solid rgba(255,255,255,0.2)",
              transition: "transform 0.2s ease",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" />
            </svg>
            {unreadCount > 0 && (
              <div
                className="unread-badge"
                style={{ border: "3px solid var(--bg-secondary)" }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            )}
          </button>
        )}

        {/* MOBILE CHAT: SLIDE-UP DRAWER */}
        {!isTablet && activeRoomId && (
          <>
            <div
              className={`drawer-backdrop ${chatOpen ? "open" : ""}`}
              onClick={() => setChatOpen(false)}
            />
            <div
              className={`chat-drawer ${chatOpen ? "open" : ""}`}
              style={{
                padding: "12px 8px",
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
              }}
            >
              <div className="drawer-handle" />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  padding: "0 8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 20 }}>#</span>
                  <h3
                    style={{ margin: 0, color: "var(--text-primary)", fontSize: 16 }}
                  >
                    chat
                  </h3>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  style={{
                    minHeight: 32,
                    minWidth: 32,
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontSize: 24,
                    border: "none",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
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
      </div>
    </div>
  );
}