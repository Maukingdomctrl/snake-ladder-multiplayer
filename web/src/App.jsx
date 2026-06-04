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

// The curated palette of token colors
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

  // Color Picker State
  const [playerColor, setPlayerColor] = useState(
    localStorage.getItem("playerColor") || COLORS[0]
  );

  const isMyTurn =
    roomData?.status === "playing" && roomData?.currentTurn === playerId;

  const getName = (pid) => roomData?.playerNames?.[pid] || pid;
  const currentTurnName = roomData?.currentTurn ? getName(roomData.currentTurn) : "";

  // Derive which colors are currently claimed in the active room
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
    if (!joinId.trim()) return;
    if (!playerName.trim()) {
      setError("Please enter your name first");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await joinRoom(joinId.trim(), playerId, playerName.trim(), playerColor);
      setJoined(joinId.trim());
      setActiveRoomId(joinId.trim());
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
    }

  }, [roomData]);

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
    <div style={{ padding: 24 }}>
      <h1>Snake & Ladder Multiplayer</h1>
      
      <p><b>You are:</b> {playerId}</p>
      
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 200, gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Enter your name (e.g. Mau)"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
        {/* Note: The old HTML color picker was removed from here */}
      </div>

      <button onClick={onCreateRoom} disabled={loading}>
        {loading ? "Please wait..." : "Create Room"}
      </button>

      {roomId && (
        <p>
          Room created: <b>{roomId}</b>
        </p>
      )}

      <hr style={{ margin: "16px 0" }} />

      <input
        placeholder="Enter room id"
        value={joinId}
        onChange={(e) => setJoinId(e.target.value)}
      />
      <button onClick={onJoinRoom} disabled={loading} style={{ marginLeft: 8 }}>
        Join Room
      </button>

      {joined && (
        <p>
          Joined room: <b>{joined}</b>
        </p>
      )}

      {roomData && (
        <div style={{ marginTop: 16 }}>
          <h3>Live Room</h3>

          {roomData?.status === "playing" && (
            <p style={{ fontSize: 20, fontWeight: "bold", color: "#7c3aed" }}>
              It’s {currentTurnName}'s turn {roomData.currentTurn === playerId ? "(You)" : ""}
            </p>
          )}

          <p><b>ID:</b> {roomData.id}</p>
          <p><b>Status:</b> {roomData.status}</p>
          <p><b>Host:</b> {getName(roomData.hostId)}</p>
          <p>
            <b>Players:</b>{" "}
            {roomData.players?.map((pid) => `${getName(pid)} (${pid})`).join(", ")}
          </p>
          <p>
            <b>Positions:</b>{" "}
            {roomData.positions
              ? Object.entries(roomData.positions)
                  .map(([pid, pos]) => `${getName(pid)}: ${pos}`)
                  .join(" | ")
              : "N/A"}
          </p>

          {/* New Interactive Lobby Color Picker */}
          {roomData?.status === "waiting" && (
            <div style={{ margin: "16px 0", padding: "16px", background: "#f3f4f6", borderRadius: "8px" }}>
              <p style={{ marginTop: 0 }}><b>Pick your color:</b></p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COLORS.map(c => {
                  const taken = takenColors.includes(c) && roomData?.playerColors?.[playerId] !== c;
                  return (
                    <div 
                      key={c} 
                      onClick={() => !taken && onPickColor(c)}
                      style={{
                        width: 32, height: 32, borderRadius: "50%", background: c,
                        border: playerColor === c ? "3px solid #000" : "2px solid #aaa",
                        opacity: taken ? 0.3 : 1,
                        cursor: taken ? "not-allowed" : "pointer",
                      }}
                      title={taken ? "Taken" : "Available"}
                    />
                  );
                })}
              </div>
              <p style={{ fontSize: 12, color: "#666", marginBottom: 0, marginTop: 12 }}>
                {Object.entries(roomData?.playerColors || {}).map(([pid, c]) =>
                  `${roomData?.playerNames?.[pid] || pid}: ${c}`
                ).join(" | ")}
              </p>
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
        </div>
      )}

      {roomData?.status === "finished" && roomData?.winnerId && (
        <p style={{ color: "green", fontWeight: "bold", fontSize: 24 }}>
          Winner: {getName(roomData.winnerId)} 🎉
        </p>
      )}

      {roomData?.status === "waiting" && roomData?.hostId === playerId && (
        <button onClick={onStartGame} disabled={loading} style={{ marginTop: 8 }}>
          Start Game
        </button>
      )}

      {roomData?.status === "countdown" && (
        <div style={{ marginTop: 12 }}>
          <p><b>Starting in:</b> {countdown ?? 5}s</p>
          <p style={{ fontSize: 24, fontWeight: "bold", color: "#16a34a" }}>
            {(countdown ?? 5) >= 4 ? "Get" : (countdown ?? 5) >= 2 ? "Set" : "Go!"}
          </p>
        </div>
      )}

      {roomData?.status === "playing" && (
        <Dice
          onRoll={onRollDice}
          disabled={loading || !isMyTurn}
          lastDice={roomData?.lastDice}
          rollKey={`${roomData?.lastRolledBy}-${roomData?.updatedAt?.seconds}`}
          onRollComplete={handleRollComplete}
        />
      )}

      {jumpMessage && (
        <p style={{ marginTop: 8, fontWeight: "bold", color: "#1d4ed8" }}>
          {jumpMessage}
        </p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Chat UI */}
      {activeRoomId && (
        <div style={{ marginTop: 24, borderTop: "1px solid #ccc", paddingTop: 16 }}>
          <h3>Chat</h3>
          <div style={{ height: 200, overflowY: "auto", border: "1px solid #ccc", padding: 8, marginBottom: 8 }}>
            {messages.map(m => (
              <p key={m.id} style={{ margin: "4px 0" }}>
                <b>{m.playerName}:</b> {m.text}
              </p>
            ))}
          </div>
          
          {showEmojiPicker && (
            <EmojiPicker onEmojiClick={(emojiData) => setChatInput(prev => prev + emojiData.emoji)} />
          )}
          
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowEmojiPicker(p => !p)}>😊</button>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onSendMessage()}
              placeholder="Type a message..."
              style={{ flex: 1 }}
            />
            <button onClick={onSendMessage}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}