// web/src/App.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase/index";
import "./App.css";

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

import { usePlayerStorage } from "./hooks/usePlayerStorage";
import { useGameSync } from "./hooks/useGameSync";
import { useWindowDimensions } from "./hooks/useWindowDimensions";

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
  const { playerId, playerName, setPlayerName, playerColor, setPlayerColor } = usePlayerStorage();
  const { width, height } = useWindowDimensions();

  const isTablet = width >= 768;
  const isCompact = height < 700;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [joinId, setJoinId] = useState<string>("");
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const [roomData, setRoomData] = useState<Room | null>(null);
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>({});
  const [jumpMessage, setJumpMessage] = useState<string>("");
  const [diceComplete, setDiceComplete] = useState<boolean>(true);
  const { countdown } = useGameSync(roomData, playerId);

  const [messages, setMessages] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState<boolean>(isTablet);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // ★ Board container measurement
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardDims, setBoardDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // ★ Mobile keyboard tracking
  const drawerRef = useRef<HTMLDivElement>(null);

  const prevRoomRef = useRef<Room | null>(null);
  const lastProcessedMoveRef = useRef<string>("");
  const prevMsgCountRef = useRef<number>(0);
  const isFirstMessageLoadRef = useRef<boolean>(true);
  const diceFinishedRef = useRef<boolean>(true);
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJumpMessageRef = useRef<string>("");
  const pendingPositionsRef = useRef<Record<string, number>>({});

  // ★ ResizeObserver for board container
  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver((entries) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setBoardDims({ width: Math.floor(width), height: Math.floor(height) });
          }
        }
      }, 50);
    });

    ro.observe(el);

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setBoardDims({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    }

    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
  }, [roomData?.status]);

  // ★★★ FIX 1: VisualViewport keyboard detection for mobile drawer ★★★
  useEffect(() => {
    if (isTablet || !chatOpen) return;

    const vv = window.visualViewport;
    if (!vv) return;

    let rafId = 0;
    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const kh = window.innerHeight - vv.height - vv.offsetTop;
        const drawer = drawerRef.current;
        if (!drawer) return;
        if (kh > 50) {
          // ★ Use bottom instead of transform — drawer sits directly above keyboard
          drawer.style.bottom = `${kh}px`;
          drawer.style.height = `${(window.innerHeight - kh) * 0.85}px`;
          drawer.classList.add('keyboard-active');
        } else {
          drawer.style.bottom = '';
          drawer.style.height = '';
          drawer.classList.remove('keyboard-active');
        }
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      cancelAnimationFrame(rafId);
    };
  }, [isTablet, chatOpen]);

  // ★★★ FIX 2: Lock body scroll when mobile chat drawer is open ★★★
  useEffect(() => {
    if (chatOpen && !isTablet) {
      const prev = document.body.style.overflow;
      const prevTouch = document.body.style.overscrollBehavior;
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
      return () => {
        document.body.style.overflow = prev;
        document.body.style.overscrollBehavior = prevTouch;
      };
    }
  }, [chatOpen, isTablet]);

  useEffect(() => {
    if (isTablet) {
      setChatOpen(true);
    } else {
      setChatOpen(false);
    }
  }, [isTablet]);

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

  const isMyTurn =
    roomData?.status === "playing" && roomData?.currentTurn === playerId && diceComplete;
  const getName = (pid: string) => roomData?.playerNames?.[pid] || pid;
  const displayTurnId = diceComplete ? roomData?.currentTurn : roomData?.lastRolledBy;
  const currentTurnName = displayTurnId ? getName(displayTurnId) : "";

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
    if (trimmedId.length !== 4)
      return setError("Room code must be exactly 4 digits");
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
    setUnreadCount(0);

    setMessages([]);
    pendingJumpMessageRef.current = "";
    pendingPositionsRef.current = {};
    diceFinishedRef.current = true;
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

    if (
      roomData.lastDice != null &&
      roomData.lastRolledBy &&
      roomData.positions &&
      prev.positions
    ) {
      const moveKey = String(roomData.moveCount ?? 0);

      if (lastProcessedMoveRef.current !== moveKey) {
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
        const from = roomData.lastFrom;
        const to = roomData.positions?.[pid] ?? from;
        const movedTo = Math.min(100, (from ?? 1) + roomData.lastDice);

        if (from != null) {
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

  const isPlayingOrFinished =
    roomData?.status === "playing" || roomData?.status === "finished";

  // ★★★ FIX 3: Close chat drawer helper ★★★
  const closeChatDrawer = useCallback(() => {
    setChatOpen(false);
    const drawer = drawerRef.current;
    if (drawer) {
      drawer.style.bottom = '';
      drawer.style.height = '';
      drawer.classList.remove('keyboard-active');
    }
  }, []);

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
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 15,
            }}
          >
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
            {error && (
              <div
                style={{
                  position: "fixed",
                  top: 16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--danger)",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 6,
                  zIndex: 1000,
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <span>{error}</span>
                <button
                  onClick={() => setError("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            )}

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
                gap: isTablet ? 16 : 0,
                alignItems: "stretch",
                overflow: "hidden",
              }}
            >
              {/* LEFT COLUMN */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  overflow: isPlayingOrFinished ? "hidden" : "auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 8,
                  position: "relative",
                }}
              >
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

                {roomData.status === "countdown" && (
                  <CountdownCard
                    countdown={countdown}
                    hostName={getName(roomData.hostId)}
                  />
                )}

                {(roomData.status === "playing" ||
                  roomData.status === "finished") && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: "100%",
                      flex: 1,
                      minHeight: 0,
                      overflow: "hidden",
                    }}
                  >
                    {/* TOP BAR */}
                    <div style={{ flexShrink: 0, padding: "2px 8px 4px" }}>
                      {roomData.status === "playing" ? (
                        <div
                          className="turn-indicator"
                          style={{
                            fontSize: 13,
                            padding: "1px 0",
                            marginBottom: 4,
                          }}
                        >
                          {currentTurnName}'s turn
                          {roomData.currentTurn === playerId ? " (You)" : ""}
                        </div>
                      ) : (
                        <div
                          style={{
                            background: "var(--bg-tertiary)",
                            borderRadius: 8,
                            padding: "4px 10px",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            display: "flex",
                            gap: 12,
                            border: "1px solid var(--border)",
                            marginBottom: 4,
                          }}
                        >
                          <span>
                            <b style={{ color: "var(--text-primary)" }}>
                              Status:
                            </b>{" "}
                            {roomData.status}
                          </span>
                          <span>
                            <b style={{ color: "var(--text-primary)" }}>
                              Host:
                            </b>{" "}
                            {getName(roomData.hostId)}
                          </span>
                        </div>
                      )}

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
                    </div>

                    {/* BOARD AREA */}
                    <div
                      ref={boardContainerRef}
                      style={{
                        flex: 1,
                        minHeight: 0,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        overflow: "hidden",
                      }}
                    >
                      <Board
                        key={activeRoomId}
                        positions={displayPositions}
                        playerNames={roomData?.playerNames || {}}
                        roomData={roomData}
                        hideLegend={true}
                        diceComplete={diceComplete}
                        dimensions={
                          boardDims.width > 0 ? boardDims : undefined
                        }
                      />
                    </div>

                    {/* BOTTOM BAR */}
                    <div style={{ flexShrink: 0, padding: "0 8px" }}>
                      {roomData.status === "finished" &&
                        roomData.winnerId &&
                        diceComplete && (
                          <WinnerOverlay
                            winnerName={getName(roomData.winnerId)}
                            isHost={roomData.hostId === playerId}
                            onPlayAgain={async () => {
                              setError("");
                              try {
                                await startGame(activeRoomId, playerId);
                              } catch (e: any) {
                                setError(
                                  e.message || "Failed to restart game"
                                );
                              }
                            }}
                            onLeave={onLeaveRoom}
                          />
                        )}

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
                    <span
                      style={{ color: "var(--text-muted)", fontSize: 20 }}
                    >
                      #
                    </span>
                    <h3
                      style={{
                        margin: 0,
                        color: "var(--text-primary)",
                        fontSize: 16,
                      }}
                    >
                      chat
                    </h3>
                  </div>
                  <Chat
                    messages={messages}
                    playerId={playerId}
                    playerName={playerName}
                    activeRoomId={activeRoomId}
                    roomData={roomData}
                    inDrawer={false}
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
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
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

        {/* ★★★ MOBILE CHAT: SLIDE-UP DRAWER — Keyboard-aware ★★★ */}
        {!isTablet && activeRoomId && (
          <>
            <div
              className={`drawer-backdrop ${chatOpen ? "open" : ""}`}
              onClick={closeChatDrawer}
            />
            <div
              ref={drawerRef}
              className={`chat-drawer ${chatOpen ? "open" : ""}`}
              style={{
                padding: "12px 0",
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
                  padding: "0 12px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    style={{ color: "var(--text-muted)", fontSize: 20 }}
                  >
                    #
                  </span>
                  <h3
                    style={{
                      margin: 0,
                      color: "var(--text-primary)",
                      fontSize: 16,
                    }}
                  >
                    chat
                  </h3>
                </div>
                <button
                  onClick={closeChatDrawer}
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
                inDrawer={true}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}