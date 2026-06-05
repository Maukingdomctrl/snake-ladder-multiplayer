import { useEffect, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase/index";
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

function getPlayerId() {
  const key = "playerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `p_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function formatTime(at) {
  if (!at) return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = typeof at.toDate === "function" ? at.toDate() : new Date(at.seconds ? at.seconds * 1000 : at);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [roomId, setRoomId] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joined, setJoined] = useState("");

  const [activeRoomId, setActiveRoomId] = useState("");
  const [roomData, setRoomData] = useState(null);

  const [displayPositions, setDisplayPositions] = useState({});
  const [diceComplete, setDiceComplete] = useState(false);

  const diceFinishedRef = useRef(false);
  const pendingPositionsRef = useRef(null);
  const observerTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [jumpMessage, setJumpMessage] = useState("");
  const prevRoomRef = useRef(null);
  const lastProcessedMoveRef = useRef("");

  const [countdown, setCountdown] = useState(null);
  const finalizeCalledRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const playerId = getPlayerId();

  const [playerName, setPlayerName] = useState(localStorage.getItem("playerName") || "");

  const [playerColor, setPlayerColor] = useState(localStorage.getItem("playerColor") || COLORS[0]);

  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768);
  const [chatOpen, setChatOpen] = useState(window.innerWidth >= 768);
  const [unreadCount, setUnreadCount] = useState(0);

  const prevMsgCountRef = useRef(0);
  const isFirstMessageLoadRef = useRef(true);

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
    if (chatOpen || isTablet) {
      setUnreadCount(0);
    }
  }, [chatOpen, isTablet]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatOpen]);

  const isMyTurn = roomData?.status === "playing" && roomData?.currentTurn === playerId;

  const getName = (pid) => roomData?.playerNames?.[pid] || pid;
  const currentTurnName = roomData?.currentTurn ? getName(roomData.currentTurn) : "";

  const takenColors = Object.values(roomData?.playerColors || {});

  useEffect(() => {
    localStorage.setItem("playerName", playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem("playerColor", playerColor);
  }, [playerColor]);

  const onPickColor = async (color) => {
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      setError(e.message || "Failed to roll dice");
    } finally {
      setLoading(false);
    }
  };

  // FIXED
  const onSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !activeRoomId) return;
    setChatInput(""); // clear immediately
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

    const unsub = subscribeRoom(activeRoomId, (room) => {
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

  const isEmojiOnly = (text) => {
    const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u;
    return emojiRegex.test(text.trim()) && text.trim().length <= 8;
  };

  const renderChatContent = () => {
    let lastSenderId = null;

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
                onEmojiClick={(emojiData) => setChatInput((prev) => prev + emojiData.emoji)}
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
                // FIXED
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
                // FIXED
                setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 300);
              }}
              rows={1}
              placeholder="Message #game-room"
              style={{
                flex: 1,
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
        minHeight: "100dvh", // FIXED
        height: "100dvh", // FIXED
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        color: "var(--text-primary)",
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      <div
        style={{
          maxWidth: isTablet ? "1000px" : "100%",
          margin: "0 auto",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          paddingTop: "max(0px, env(safe-area-inset-top))",
          paddingLeft: "max(12px, env(safe-area-inset-left))",
          paddingRight: "max(12px, env(safe-area-inset-right))",
        }}
      >
        {!activeRoomId && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            <h1 style={{ fontSize: 22, marginBottom: 8, marginTop: 24 }}>Snake & Ladder Multiplayer</h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Player ID: {playerId}</p>

            <div style={{ display: "flex", flexDirection: "column", maxWidth: 200, gap: 8, marginBottom: 16 }}>
              <input
                placeholder="Enter your name (e.g. Mau)"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                style={{
                  fontSize: 16,
                  padding: "8px 12px",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
            </div>

            <button onClick={onCreateRoom} disabled={loading} className="btn-primary" style={{ minHeight: 44, minWidth: 44 }}>
              {loading ? "Please wait..." : "Create Room"}
            </button>

            {roomId && (
              <p>
                Room created: <b>{roomId}</b>
              </p>
            )}

            <hr style={{ margin: "16px 0", borderColor: "var(--border)" }} />

            <div style={{ display: "flex", alignItems: "center", maxWidth: 300 }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                placeholder="Enter 4-digit code"
                value={joinId}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setJoinId(val);
                }}
                style={{
                  fontSize: 16,
                  padding: "8px 12px",
                  flex: 1,
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <button onClick={onJoinRoom} disabled={loading} className="btn-primary" style={{ marginLeft: 8, minHeight: 44, minWidth: 44 }}>
                Join Room
              </button>
            </div>
          </div>
        )}

        {error && <p style={{ color: "var(--danger)", margin: "8px 0" }}>{error}</p>}

        {roomData && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
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
                  {roomData.players?.map((pid, idx) => (
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
              {/* LEFT COLUMN: GAME BOARD */}
              <div
                className="game-column"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  overflowY: "auto",
                  paddingRight: 8,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                {roomData?.status === "playing" && (
                  <p
                    style={{
                      alignSelf: "flex-start",
                      borderLeft: "3px solid #c9b8ff",
                      paddingLeft: 12,
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#c9b8ff",
                      marginTop: 0,
                      marginBottom: 12,
                    }}
                  >
                    It’s {currentTurnName}'s turn {roomData.currentTurn === playerId ? "(You)" : ""}
                  </p>
                )}

                <div
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--bg-tertiary)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    marginBottom: 12,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    gap: 16,
                  }}
                >
                  <span>
                    <b style={{ color: "var(--text-primary)" }}>Status</b> {roomData.status}
                  </span>
                  <span>
                    <b style={{ color: "var(--text-primary)" }}>Host</b> {getName(roomData.hostId)}
                  </span>
                </div>

                {roomData?.status === "waiting" && (
                  <div style={{ margin: "16px 0", padding: "16px", background: "var(--bg-tertiary)", borderRadius: "8px", width: "100%" }}>
                    <p style={{ marginTop: 0, textAlign: "center", color: "var(--text-primary)" }}>
                      <b>Pick your color:</b>
                    </p>
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
                              border: playerColor === c ? "4px solid #000" : "2px solid #aaa",
                              opacity: taken ? 0.3 : 1,
                              cursor: taken ? "not-allowed" : "pointer",
                            }}
                            title={taken ? "Taken" : "Available"}
                          />
                        );
                      })}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        flexWrap: "wrap",
                        fontSize: 12,
                        color: "var(--text-muted)",
                        marginBottom: 0,
                        marginTop: 12,
                      }}
                    >
                      {Object.entries(roomData?.playerColors || {}).map(([pid, c]) => (
                        <span key={pid} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />
                          {roomData?.playerNames?.[pid] || pid}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {roomData.positions && (
                  <div style={{ paddingBottom: 16 }}>
                    <Board
                      key={activeRoomId}
                      positions={displayPositions}
                      playerNames={roomData?.playerNames || {}}
                      roomData={roomData}
                      diceComplete={diceComplete}
                    />
                  </div>
                )}

                {roomData?.status === "finished" && roomData?.winnerId && (
                  <p style={{ color: "var(--online)", fontWeight: "bold", fontSize: 24, textAlign: "center", margin: "24px 0", width: "100%" }}>
                    Winner: {getName(roomData.winnerId)} 🎉
                  </p>
                )}

                {roomData?.status === "waiting" && roomData?.hostId === playerId && (
                  <button onClick={onStartGame} disabled={loading} className="btn-primary" style={{ marginTop: 16, minHeight: 44, width: "100%" }}>
                    Start Game
                  </button>
                )}

                {roomData?.status === "countdown" && (
                  <div style={{ marginTop: 12, textAlign: "center", width: "100%" }}>
                    <p style={{ color: "var(--text-primary)" }}>
                      <b>Starting in:</b> {countdown ?? 5}s
                    </p>
                    <p style={{ fontSize: 24, fontWeight: "bold", color: "var(--online)" }}>
                      {(countdown ?? 5) >= 4 ? "Get" : (countdown ?? 5) >= 2 ? "Set" : "Go!"}
                    </p>
                  </div>
                )}

                {roomData?.status === "playing" && (
                  <div
                    style={{
                      background: "var(--bg-tertiary)",
                      borderRadius: 16,
                      padding: "16px 24px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 16,
                      marginBottom: 24,
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
                )}

                {jumpMessage && (
                  <p
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      borderRadius: 24,
                      padding: "6px 16px",
                      display: "block",
                      fontSize: 14,
                      color: "var(--text-primary)",
                      textAlign: "center",
                      margin: "16px auto",
                      width: "fit-content",
                    }}
                  >
                    {jumpMessage}
                  </p>
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
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "none",
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
