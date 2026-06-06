import { useEffect, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase/index";
import { getDiscordUser } from './discord';
import "./App.css";
import {
  createRoom,
  joinRoom,
  subscribeRoom,
  startGame,
  finalizeGameStart,
  rollDice,
  sendMessage,
  subscribeMessages,
} from "./firebase/rooms";
import Dice from "./components/Dice";
import Board from "./components/Board";

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#e91e63"];

function getPlayerId(): string {
  // Use Discord user ID if available
  const discordUser = getDiscordUser();
  if (discordUser?.id) return `discord_${discordUser.id}`;

  // Fall back to localStorage ID for browser play
  const key = "playerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `p_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function formatTime(at: any): string {
  if (!at) return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = typeof at.toDate === "function" ? at.toDate() : new Date(at.seconds ? at.seconds * 1000 : at);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [roomId, setRoomId] = useState<string>("");
  const [joinId, setJoinId] = useState<string>("");
  const [joined, setJoined] = useState<string>("");

  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [roomData, setRoomData] = useState<any>(null);

  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>({});
  const [diceComplete, setDiceComplete] = useState<boolean>(false);

  const diceFinishedRef = useRef<boolean>(false);
  const pendingPositionsRef = useRef<Record<string, number> | null>(null);
  const observerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [jumpMessage, setJumpMessage] = useState<string>("");
  const prevRoomRef = useRef<any>(null);
  const lastProcessedMoveRef = useRef<string>("");

  const [countdown, setCountdown] = useState<number | null>(null);
  const finalizeCalledRef = useRef<boolean>(false);

  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);

  // Change 1: copied state
  const [copied, setCopied] = useState<boolean>(false);

  const playerId = getPlayerId();

  const [playerName, setPlayerName] = useState<string>(() => {
  const discordUser = getDiscordUser();
  if (discordUser?.username) return discordUser.username;
  return localStorage.getItem("playerName") || "";
  });
  const [playerColor, setPlayerColor] = useState<string>(localStorage.getItem("playerColor") || COLORS[0]);

  const [isTablet, setIsTablet] = useState<boolean>(window.innerWidth >= 768);
  const [chatOpen, setChatOpen] = useState<boolean>(window.innerWidth >= 768);
  const [chatExpanded, setChatExpanded] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const prevMsgCountRef = useRef<number>(0);
  const isFirstMessageLoadRef = useRef<boolean>(true);

  useEffect(() => {
    const h = () => {
      const tablet = window.innerWidth >= 768;
      setIsTablet(tablet);
      if (tablet) setChatOpen(true);
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
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
    if (chatOpen || isTablet || chatExpanded) {
      setUnreadCount(0);
    }
  }, [chatOpen, isTablet, chatExpanded]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatOpen]);

  const isMyTurn = roomData?.status === "playing" && roomData?.currentTurn === playerId;

  const getName = (pid: string) => roomData?.playerNames?.[pid] || pid;
  const currentTurnName = roomData?.currentTurn ? getName(roomData.currentTurn) : "";

  const takenColors = Object.values(roomData?.playerColors || {}) as string[];

  useEffect(() => {
    localStorage.setItem("playerName", playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem("playerColor", playerColor);
  }, [playerColor]);

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
    if (!playerName.trim()) {
      setError("Please enter your name first");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const id = await createRoom(playerId, playerName.trim(), playerColor);
      setRoomId(id);
      setJoinId(id);
      setJoined(id);
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

    if (trimmedId.length !== 4) {
      setError("Room code must be exactly 4 digits");
      return;
    }

    if (!playerName.trim()) {
      setError("Please enter your name first");
      return;
    }

    setLoading(true);
    try {
      await joinRoom(trimmedId, playerId, playerName.trim(), playerColor);
      setJoined(trimmedId);
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
    } finally {
      setLoading(false);
    }
  };

  const onSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !activeRoomId) return;
    setChatInput("");
    setShowEmojiPicker(false);
    await sendMessage(activeRoomId, playerId, playerName, text);
  };

  const handleRollComplete = () => {
    diceFinishedRef.current = true;
    setTimeout(() => setDiceComplete(true), 2000);
  };

  useEffect(() => {
    if (!activeRoomId) return;

    setJumpMessage("");
    prevRoomRef.current = null;
    lastProcessedMoveRef.current = "";

    setDisplayPositions({});

    isFirstMessageLoadRef.current = true;
    prevMsgCountRef.current = 0;

    const unsub = subscribeRoom(activeRoomId, (room: any) => {
      setRoomData(room);
    });

    const unsubMessages = subscribeMessages(activeRoomId, setMessages);

    return () => {
      if (typeof unsub === "function") unsub();
      if (typeof unsubMessages === "function") unsubMessages();
    };
  }, [activeRoomId]);

  useEffect(() => {
    if (!roomData) return;

    const prev = prevRoomRef.current;

    if (!prev && roomData.positions) {
      setDisplayPositions(roomData.positions);
    }

    if (prev && roomData.lastDice != null && roomData.lastRolledBy && roomData.positions && prev.positions) {
      const ts = roomData.updatedAt;
      const moveKey = `${roomData.lastRolledBy}|${roomData.lastDice}|${ts?.seconds ?? ""}|${ts?.nanoseconds ?? ""}`;

      if (lastProcessedMoveRef.current === moveKey) {
        prevRoomRef.current = roomData;
      } else {
        const pid = roomData.lastRolledBy;
        const from = roomData.lastFrom ?? 1;
        const to = roomData.positions?.[pid] ?? from;
        const movedTo = Math.min(100, from + roomData.lastDice);

        if (to > movedTo) {
          setJumpMessage(`🪜 Ladder! ${movedTo} → ${to}`);
        } else if (to < movedTo) {
          setJumpMessage(`🐍 Snake! ${movedTo} → ${to}`);
        } else {
          setJumpMessage("");
        }

        lastProcessedMoveRef.current = moveKey;
      }
    } else if (prev && !roomData.lastDice && roomData.positions) {
      setDisplayPositions(roomData.positions);
    }

    prevRoomRef.current = roomData;

    if (roomData?.positions) {
      pendingPositionsRef.current = roomData.positions;
      setDisplayPositions(roomData.positions);
      diceFinishedRef.current = false;
      setDiceComplete(false);

      if (observerTimeoutRef.current) {
        clearTimeout(observerTimeoutRef.current);
      }

      if (roomData?.lastRolledBy && roomData.lastRolledBy !== playerId) {
        observerTimeoutRef.current = setTimeout(() => {
          setDiceComplete(true);
        }, 5000);
      }
    }

    return () => {
      if (observerTimeoutRef.current) {
        clearTimeout(observerTimeoutRef.current);
      }
    };
  }, [roomData, playerId]);

  useEffect(() => {
    if (!roomData || roomData.status !== "countdown" || !roomData.countdownEndsAt) {
      setCountdown(null);
      finalizeCalledRef.current = false;
      return;
    }

    const tick = async () => {
      const leftMs = Math.max(0, roomData.countdownEndsAt - Date.now());
      const sec = Math.ceil(leftMs / 1000);
      setCountdown(sec);

      if (leftMs <= 0 && !finalizeCalledRef.current && roomData?.id) {
        finalizeCalledRef.current = true;
        try {
          await finalizeGameStart(roomData.id);
          setDisplayPositions(roomData?.positions || {});
        } catch (_) {}
      }
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [roomData]);

  const isEmojiOnly = (text: string) => {
    const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u;
    return emojiRegex.test(text.trim()) && text.trim().length <= 8;
  };

  const renderChatContent = () => {
    let lastSenderId: string | null = null;

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 0 0 0",
            marginBottom: 8,
            backgroundColor: "var(--bg-primary)",
            borderRadius: 8,
          }}
        >
          {messages.map((m) => {
            const isMe = m.playerId === playerId;
            const isFirstInGroup = lastSenderId !== m.playerId;
            lastSenderId = m.playerId;
            const timeString = formatTime(m.at);
            const emojiOnly = isEmojiOnly(m.text);

            return (
              <div
                key={m.id}
                className={isFirstInGroup ? "chat-row" : "chat-row chat-grouped"}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                  marginTop: isFirstInGroup ? 12 : 2,
                  marginBottom: 2,
                }}
              >
                {isFirstInGroup && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: isMe ? "row-reverse" : "row",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <div
                      className="avatar"
                      style={{
                        backgroundColor: roomData?.playerColors?.[m.playerId] || "#ccc",
                        marginRight: isMe ? 0 : 12,
                        marginLeft: isMe ? 12 : 0,
                      }}
                    >
                      {m.playerName.charAt(0).toUpperCase()}
                    </div>
                    <span className="chat-sender" style={{ color: roomData?.playerColors?.[m.playerId] || "var(--text-primary)" }}>
                      {m.playerName}
                    </span>
                    <span className="chat-timestamp">{timeString}</span>
                  </div>
                )}

                <div
                  style={{
                    backgroundColor: emojiOnly ? "transparent" : isMe ? "var(--accent)" : "var(--bg-input)",
                    color: emojiOnly ? "inherit" : isMe ? "#fff" : "var(--text-primary)",
                    fontSize: emojiOnly ? 32 : 14,
                    padding: emojiOnly ? "4px 8px" : "8px 12px",
                    borderRadius: emojiOnly ? 8 : 16,
                    borderBottomRightRadius: isMe ? 4 : 16,
                    borderBottomLeftRadius: !isMe ? 4 : 16,
                    maxWidth: "85%",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                  className="chat-message"
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} style={{ height: 12 }} />
        </div>

        <div style={{ position: "relative" }}>
          {showEmojiPicker && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 12px)",
                right: 0,
                zIndex: 999,
                background: "var(--bg-secondary)",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                overflow: "hidden",
              }}
            >
              <EmojiPicker
                theme="dark"
                onEmojiClick={(emojiData: any) => setChatInput((prev) => prev + emojiData.emoji)}
                style={{ width: "100%", maxWidth: "320px", border: "none" }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "var(--bg-input)",
              borderRadius: 24,
              padding: "8px 16px",
              gap: 12,
            }}
          >
            <button
              disabled
              style={{
                width: 24,
                height: 24,
                minWidth: 24,
                minHeight: 24,
                padding: 0,
                borderRadius: "50%",
                backgroundColor: "var(--text-secondary)",
                color: "var(--bg-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                fontSize: 18,
                fontWeight: "bold",
                cursor: "not-allowed",
                flexShrink: 0,
              }}
            >
              +
            </button>

            <textarea
              className="chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const text = chatInput.trim();
                  if (!text || !activeRoomId) return;
                  setChatInput("");
                  setShowEmojiPicker(false);
                  sendMessage(activeRoomId, playerId, playerName, text);
                }
              }}
              onFocus={() => {
                setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 300);
              }}
              rows={1}
              placeholder="Message #game-room"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "2px 0",
                lineHeight: "20px",
                maxHeight: "120px",
                background: "transparent",
                resize: "none",
              }}
            />

            <button
              onClick={() => setShowEmojiPicker((p) => !p)}
              style={{
                minHeight: 28,
                minWidth: 28,
                padding: 0,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM8.5 9.5C9.328 9.5 10 10.172 10 11C10 11.828 9.328 12.5 8.5 12.5C7.672 12.5 7 11.828 7 11C7 10.172 7.672 9.5 8.5 9.5ZM12 17.5C9.669 17.5 7.697 16.037 6.88 14H17.12C16.303 16.037 14.331 17.5 12 17.5ZM15.5 12.5C14.672 12.5 14 11.828 14 11C14 10.172 14.672 9.5 15.5 9.5C16.328 9.5 17 10.172 17 11C17 11.828 16.328 12.5 15.5 12.5Z" />
              </svg>
            </button>

            <button
              onClick={onSendMessage}
              style={{
                minHeight: 28,
                minWidth: 28,
                padding: 0,
                background: "transparent",
                border: "none",
                color: chatInput.trim() ? "var(--accent)" : "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: chatInput.trim() ? "auto" : "none",
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.06-.87.49-.87.99l.01 4.61c0 .71.73 1.2 1.39.92z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

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
              {/* Change 7: emoji + updated title */}
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
        )}

        {/* ── MAIN GAME VIEW ── */}
        {roomData && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>

            {/* Top Navigation Bar */}
            <div
              className="channel-header"
              style={{
                margin: "0 -12px",
                borderRadius: isTablet ? "8px 8px 0 0" : "0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 24, fontWeight: 300 }}>#</span>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
                  game-room-{roomData.id}
                </h2>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {roomData.players?.map((pid: string, idx: number) => (
                    <div
                      key={`dot-${pid}`}
                      style={{
                        position: "relative",
                        marginLeft: idx === 0 ? 0 : -6,
                        zIndex: roomData.players.length - idx,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          backgroundColor: roomData.playerColors?.[pid] || "#ccc",
                          border: "2px solid var(--bg-primary)",
                        }}
                        title={roomData.playerNames?.[pid] || pid}
                      />
                      <div className="online-dot" />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary)", fontSize: 14, fontWeight: 600 }}>
                  <span>👥</span>
                  <span>{roomData.players?.length}</span>
                </div>
              </div>
            </div>

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
                  // Change 6: flex-start + paddingTop instead of center
                  justifyContent: "flex-start",
                  paddingTop: 12,
                  position: "relative",
                }}
              >

                {/* ── STATE 1: WAITING LOBBY ── */}
                {roomData?.status === "waiting" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, width: "100%", padding: 16 }}>
                    <div
                      style={{
                        background: "var(--bg-primary)",
                        padding: "32px 24px",
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
                      <h2 style={{ margin: "0 0 16px 0", color: "var(--text-primary)", fontSize: 22 }}>Room Lobby</h2>

                      <div style={{ display: "flex", gap: 12, marginBottom: 24, fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
                          <b style={{ color: "var(--text-primary)" }}>Status:</b> Waiting
                        </span>
                        <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
                          <b style={{ color: "var(--text-primary)" }}>Host:</b> {getName(roomData.hostId)}
                        </span>
                      </div>

                      {/* Change 1a: Room Code block */}
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

                      {/* Change 1b: Player list */}
                      <div style={{ width: "100%", marginBottom: 16 }}>
                        <p style={{ margin: "0 0 10px 0", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>
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

                      <div style={{ width: "100%", marginBottom: 32 }}>
                        <p style={{ margin: "0 0 16px 0", color: "var(--text-primary)", fontWeight: 600, fontSize: 15 }}>Pick your color:</p>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                          {COLORS.map((c) => {
                            const taken = takenColors.includes(c) && roomData?.playerColors?.[playerId] !== c;
                            return (
                              <div
                                key={c}
                                onClick={() => !taken && onPickColor(c)}
                                style={{
                                  width: 44,
                                  height: 44,
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

                      {/* Change 2: guarded Start button + pulse waiting text */}
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
                          {(roomData.players?.length ?? 0) < 2 && (
                            <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                              Need at least 2 players to start
                            </p>
                          )}
                        </>
                      ) : (
                        <div style={{ width: "100%", padding: "14px", background: "var(--bg-tertiary)", borderRadius: 8, color: "var(--text-muted)", fontSize: 15, border: "1px solid var(--border)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1.5s infinite" }} />
                          Waiting for host to start...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── STATE 2: COUNTDOWN CARD ── */}
                {roomData?.status === "countdown" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, width: "100%", padding: 16 }}>
                    <div
                      style={{
                        background: "var(--bg-primary)",
                        padding: "40px 32px",
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
                      <h2 style={{ margin: "0 0 16px 0", color: "var(--text-primary)", fontSize: 24 }}>Game Starting</h2>

                      <div style={{ display: "flex", gap: 12, marginBottom: 32, fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
                          <b style={{ color: "var(--text-primary)" }}>Status:</b> Starting
                        </span>
                        <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
                          <b style={{ color: "var(--text-primary)" }}>Host:</b> {getName(roomData.hostId)}
                        </span>
                      </div>

                      <div style={{
                        width: 100, height: 100, borderRadius: "50%", background: "var(--bg-tertiary)", border: "4px solid var(--accent)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 800, color: "var(--text-primary)",
                        boxShadow: "var(--shadow-md)", marginBottom: 16,
                      }}>
                        {countdown ?? 5}
                      </div>

                      <p style={{ fontSize: 20, fontWeight: "bold", color: "var(--accent)", margin: 0, textTransform: "uppercase", letterSpacing: 2 }}>
                        {(countdown ?? 5) >= 4 ? "Ready" : (countdown ?? 5) >= 2 ? "Set" : "Go!"}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── STATE 3: ACTIVE GAME (Playing or Finished) ── */}
                {(roomData?.status === "playing" || roomData?.status === "finished") && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "800px", padding: "0 8px" }}>

                    {/* Header Row: Turn indicator (left) + Status pill (right) */}
                    <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      {roomData?.status === "playing" ? (
                        // Change 5: use .turn-indicator class
                        <div className="turn-indicator">
                          It's {currentTurnName}'s turn {roomData.currentTurn === playerId ? "(You)" : ""}
                        </div>
                      ) : (
                        <div />
                      )}

                      <div style={{ background: "var(--bg-tertiary)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 16, boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)" }}>
                        <span><b style={{ color: "var(--text-primary)" }}>Status:</b> {roomData.status}</span>
                        <span><b style={{ color: "var(--text-primary)" }}>Host:</b> {getName(roomData.hostId)}</span>
                      </div>
                    </div>

                    {/* Change 3: Scoreboard strip */}
                    {roomData?.positions && (
                      <div style={{ width: "100%", marginBottom: 12, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                        {[...roomData.players]
                          .sort((a: string, b: string) => (roomData.positions?.[b] ?? 1) - (roomData.positions?.[a] ?? 1))
                          .map((pid: string, rank: number) => {
                            const isActive = roomData.currentTurn === pid && roomData.status === "playing";
                            return (
                              <div key={pid} style={{
                                display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
                                background: isActive ? "rgba(35,165,89,0.12)" : "var(--bg-tertiary)",
                                border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                                borderRadius: 10, padding: "6px 12px",
                                boxShadow: isActive ? "0 0 0 2px rgba(35,165,89,0.25)" : "none",
                                transition: "all 0.3s ease",
                              }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 14 }}>#{rank + 1}</span>
                                <div style={{
                                  width: 24, height: 24, borderRadius: "50%",
                                  background: roomData.playerColors?.[pid] || "#ccc", flexShrink: 0,
                                  boxShadow: isActive ? "0 0 0 3px var(--accent)" : "none",
                                  transition: "box-shadow 0.3s ease",
                                }} />
                                <div>
                                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>
                                    {roomData.playerNames?.[pid] || pid}{pid === playerId ? " (You)" : ""}{pid === roomData.winnerId ? " 🏆" : ""}
                                  </p>
                                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.2 }}>Sq. {roomData.positions?.[pid] ?? 1}</p>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {/* The Board */}
                    {roomData.positions && (
                      <div style={{ paddingBottom: 16, width: "100%", display: "flex", justifyContent: "center" }}>
                        <Board
                          key={activeRoomId}
                          positions={displayPositions}
                          playerNames={roomData?.playerNames || {}}
                          roomData={roomData}
                          diceComplete={diceComplete}
                          hideLegend={roomData?.status !== "waiting" && !!roomData?.positions}
                        />
                      </div>
                    )}

                    {/* Change 4: Full-screen winner overlay */}
                    {roomData?.status === "finished" && roomData?.winnerId && (
                      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                        {["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#e91e63", "#fff", "#f59e0b", "#60a5fa", "#34d399"].map((c, i) => (
                          <div key={i} style={{
                            position: "absolute",
                            width: i % 3 === 0 ? 12 : 8,
                            height: i % 3 === 0 ? 12 : 8,
                            borderRadius: i % 2 === 0 ? "50%" : "2px",
                            background: c,
                            left: `${5 + i * 8}%`,
                            top: `${5 + (i % 4) * 8}%`,
                            animation: `confetti-fall ${1.0 + i * 0.15}s ease-in ${i * 0.08}s infinite`,
                          }} />
                        ))}
                        <div style={{ background: "var(--bg-primary)", borderRadius: 20, padding: "48px 40px", maxWidth: 400, width: "100%", textAlign: "center", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
                          <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>
                          <p style={{ margin: "0 0 4px 0", fontSize: 13, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Winner</p>
                          <h2 style={{ margin: "0 0 32px 0", fontSize: 36, fontWeight: 800, color: "var(--accent)" }}>{getName(roomData.winnerId)}</h2>
                          <div style={{ display: "flex", gap: 12 }}>
                            {roomData.hostId === playerId ? (
                              <button
                                className="btn-primary"
                                style={{ flex: 1, padding: "14px" }}
                                onClick={async () => {
                                  try { await startGame(activeRoomId, playerId); } catch (_) {}
                                }}
                              >
                                Play Again
                              </button>
                            ) : (
                              <div style={{ flex: 1, padding: "14px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)", fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                                Waiting for host...
                              </div>
                            )}
                            <button
                              onClick={() => { setActiveRoomId(""); setRoomData(null); setJoined(""); }}
                              style={{ flex: 1, padding: "14px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
                            >
                              Leave Room
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dice row */}
                    {roomData?.status === "playing" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          marginTop: 16,
                          marginBottom: 24,
                          minHeight: 82,
                        }}
                      >
                        {/* Left spacer */}
                        <div style={{ flex: 1 }} />

                        {/* Center: Dice */}
                        <div
                          style={{
                            background: "var(--bg-tertiary)",
                            borderRadius: 16,
                            padding: "16px 24px",
                            boxShadow: "var(--shadow-md)",
                            border: "1px solid var(--border)",
                            zIndex: 2,
                            flexShrink: 0,
                          }}
                        >
                          <Dice
                            onRoll={onRollDice}
                            disabled={loading || !isMyTurn}
                            lastDice={roomData?.lastDice}
                            rollKey={`${roomData?.lastRolledBy}-${roomData?.updatedAt?.seconds}`}
                            onRollComplete={handleRollComplete}
                            style={{ minHeight: 48, minWidth: 48, padding: 12 }}
                          />
                        </div>

                        {/* Right: Jump message */}
                        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", paddingLeft: 24 }}>
                          {jumpMessage && (
                            <div
                              style={{
                                background: "var(--accent)",
                                boxShadow: "var(--shadow-sm)",
                                borderRadius: 24,
                                padding: "12px 20px",
                                fontSize: 15,
                                fontWeight: 700,
                                color: "#fff",
                                whiteSpace: "nowrap",
                                border: "1px solid rgba(255,255,255,0.2)",
                                pointerEvents: "none",
                              }}
                            >
                              {jumpMessage}
                            </div>
                          )}
                        </div>
                      </div>
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
                    boxShadow: "var(--shadow-md)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingLeft: 8 }}>
                    <span style={{ color: "var(--text-muted)", fontSize: 20 }}>#</span>
                    <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: 16 }}>chat</h3>
                  </div>
                  {renderChatContent()}
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
              <div className="unread-badge" style={{ border: "3px solid var(--bg-secondary)" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            )}
          </button>
        )}

        {/* MOBILE CHAT: SLIDE-UP DRAWER */}
        {!isTablet && activeRoomId && (
          <>
            <div className={`drawer-backdrop ${chatOpen ? "open" : ""}`} onClick={() => setChatOpen(false)} />

            <div
              className={`chat-drawer ${chatOpen ? "open" : ""}`}
              style={{
                padding: "12px 8px",
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
              }}
            >
              <div className="drawer-handle" />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 20 }}>#</span>
                  <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: 16 }}>chat</h3>
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
              {renderChatContent()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
