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

const COLORS = ["#e74c3c","#3498db","#2ecc71","#f1c40f","#9b59b6","#e67e22","#1abc9c","#e91e63"];

function getPlayerId() {
  const key = "playerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `p_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
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

  const [jumpMessage, setJumpMessage] = useState("");
  const prevRoomRef = useRef(null);
  const lastProcessedMoveRef = useRef(""); 

  const [countdown, setCountdown] = useState(null);
  const finalizeCalledRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const playerId = getPlayerId();
  
  const [playerName, setPlayerName] = useState(
    localStorage.getItem("playerName") || ""
  );

  const [playerColor, setPlayerColor] = useState(
    localStorage.getItem("playerColor") || COLORS[0]
  );

  // Hook to detect tablet/desktop screens for side-by-side layout
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768);
  useEffect(() => {
    const h = () => setIsTablet(window.innerWidth >= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const isMyTurn =
    roomData?.status === "playing" && roomData?.currentTurn === playerId;

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
          [`playerColors.${playerId}`]: color
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

  const onSendMessage = async () => {
    if (!chatInput.trim() || !activeRoomId) return;
    await sendMessage(activeRoomId, playerId, playerName, chatInput.trim());
    setChatInput("");
    setShowEmojiPicker(false);
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

    if (
      prev &&
      roomData.lastDice != null &&
      roomData.lastRolledBy &&
      roomData.positions &&
      prev.positions
    ) {
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

  return (
    <div style={{ 
      maxWidth: isTablet ? "1000px" : "600px", 
      margin: "0 auto",
      paddingTop: "max(12px, env(safe-area-inset-top))",
      paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      paddingLeft: "max(12px, env(safe-area-inset-left))",
      paddingRight: "max(12px, env(safe-area-inset-right))",
    }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Snake & Ladder Multiplayer</h1>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>Player ID: {playerId}</p>
      
      {!activeRoomId && (
        <>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 200, gap: 8, marginBottom: 16 }}>
            <input
              placeholder="Enter your name (e.g. Mau)"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={{ fontSize: 16, padding: "8px 12px" }}
            />
          </div>

          <button 
            onClick={onCreateRoom} 
            disabled={loading}
            style={{ minHeight: 44, minWidth: 44, padding: "8px 16px" }}
          >
            {loading ? "Please wait..." : "Create Room"}
          </button>

          {roomId && (
            <p>
              Room created: <b>{roomId}</b>
            </p>
          )}

          <hr style={{ margin: "16px 0" }} />

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
              style={{ fontSize: 16, padding: "8px 12px", flex: 1 }}
            />
            <button 
              onClick={onJoinRoom} 
              disabled={loading} 
              style={{ marginLeft: 8, minHeight: 44, minWidth: 44, padding: "8px 16px" }}
            >
              Join Room
            </button>
          </div>
        </>
      )}

      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}

      {/* Main Game & Chat Side-by-Side Wrapper */}
      {roomData && (
        <div style={{ display: "flex", flexDirection: isTablet ? "row" : "column", gap: 16, marginTop: 24, alignItems: "flex-start" }}>
          
          {/* LEFT COLUMN: GAME BOARD */}
          <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
            <h3 style={{ marginTop: 0 }}>Live Room: {roomData.id}</h3>

            {roomData?.status === "playing" && (
              <p style={{ fontSize: 20, fontWeight: "bold", color: "#7c3aed" }}>
                It’s {currentTurnName}'s turn {roomData.currentTurn === playerId ? "(You)" : ""}
              </p>
            )}

            <p style={{ margin: "4px 0" }}><b>Status:</b> {roomData.status}</p>
            <p style={{ margin: "4px 0" }}><b>Host:</b> {getName(roomData.hostId)}</p>
            <p style={{ margin: "4px 0" }}>
              <b>Players:</b>{" "}
              {roomData.players?.map((pid) => `${getName(pid)} (${pid})`).join(", ")}
            </p>

            {/* Interactive Lobby Color Picker */}
            {roomData?.status === "waiting" && (
              <div style={{ margin: "16px 0", padding: "16px", background: "#f3f4f6", borderRadius: "8px" }}>
                <p style={{ marginTop: 0, textAlign: "center" }}><b>Pick your color:</b></p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                  {COLORS.map(c => {
                    const taken = takenColors.includes(c) && roomData?.playerColors?.[playerId] !== c;
                    return (
                      <div 
                        key={c} 
                        onClick={() => !taken && onPickColor(c)}
                        style={{
                          width: 44, height: 44, borderRadius: "50%", background: c,
                          border: playerColor === c ? "4px solid #000" : "2px solid #aaa",
                          opacity: taken ? 0.3 : 1,
                          cursor: taken ? "not-allowed" : "pointer",
                        }}
                        title={taken ? "Taken" : "Available"}
                      />
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", fontSize: 12, color: "#666", marginBottom: 0, marginTop: 12 }}>
                  {Object.entries(roomData?.playerColors || {}).map(([pid, c]) => (
                    <span key={pid} style={{ display:"inline-flex", alignItems:"center", gap:4, marginRight:8 }}>
                      <span style={{ width:10, height:10, borderRadius:"50%", background:c, display:"inline-block" }} />
                      {roomData?.playerNames?.[pid] || pid}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {roomData.positions && (
              <Board
                key={activeRoomId}
                positions={displayPositions}
                playerNames={roomData?.playerNames || {}}
                roomData={roomData}
                diceComplete={diceComplete}
              />
            )}

            {roomData?.status === "finished" && roomData?.winnerId && (
              <p style={{ color: "green", fontWeight: "bold", fontSize: 24, textAlign: "center", margin: "24px 0" }}>
                Winner: {getName(roomData.winnerId)} 🎉
              </p>
            )}

            {roomData?.status === "waiting" && roomData?.hostId === playerId && (
              <button 
                onClick={onStartGame} 
                disabled={loading} 
                style={{ marginTop: 16, minHeight: 44, width: "100%", padding: "8px 16px" }}
              >
                Start Game
              </button>
            )}

            {roomData?.status === "countdown" && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <p><b>Starting in:</b> {countdown ?? 5}s</p>
                <p style={{ fontSize: 24, fontWeight: "bold", color: "#16a34a" }}>
                  {(countdown ?? 5) >= 4 ? "Get" : (countdown ?? 5) >= 2 ? "Set" : "Go!"}
                </p>
              </div>
            )}

            {roomData?.status === "playing" && (
              <div style={{ display: "flex", justifyContent: "center", margin: "24px 0" }}>
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
              <p style={{ marginTop: 8, fontWeight: "bold", color: "#1d4ed8", textAlign: "center" }}>
                {jumpMessage}
              </p>
            )}
          </div>

          {/* RIGHT COLUMN: CHAT */}
          <div style={{
            width: isTablet ? 320 : "100%",
            flexShrink: 0,
            borderTop: isTablet ? "none" : "1px solid #ccc",
            borderLeft: isTablet ? "1px solid #ccc" : "none",
            paddingTop: isTablet ? 0 : 24,
            paddingLeft: isTablet ? 24 : 0,
            position: "relative"
          }}>
            <h3 style={{ marginTop: 0 }}>Chat</h3>
            <div style={{ height: isTablet ? 400 : 200, overflowY: "auto", border: "1px solid #ccc", padding: 8, marginBottom: 8, borderRadius: 8 }}>
              {messages.map(m => (
                <p key={m.id} style={{ margin: "4px 0" }}>
                  <b>{m.playerName}:</b> {m.text}
                </p>
              ))}
            </div>
            
            {showEmojiPicker && (
              <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999, display: "flex", justifyContent: "center", background: "#fff", padding: "12px 0", paddingBottom: "max(12px, env(safe-area-inset-bottom))", boxShadow: "0 -4px 12px rgba(0,0,0,0.1)" }}>
                <EmojiPicker 
                  onEmojiClick={(emojiData) => setChatInput(prev => prev + emojiData.emoji)} 
                  style={{ width: "100%", maxWidth: "600px" }}
                />
              </div>
            )}
            
            <div style={{ display: "flex", gap: 8 }}>
              <button 
                onClick={() => setShowEmojiPicker(p => !p)}
                style={{ minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}
              >
                😊
              </button>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onSendMessage()}
                placeholder="Type a message..."
                style={{ flex: 1, fontSize: 16, padding: "8px 12px" }}
              />
              <button 
                onClick={onSendMessage}
                style={{ minHeight: 44, minWidth: 44, padding: "8px 16px" }}
              >
                Send
              </button>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}