import { useEffect, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
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

  // State for delayed board token updates
  const [displayPositions, setDisplayPositions] = useState({});

  // Refs for precise animation timing and state buffering
  const diceFinishedRef = useRef(false);
  const pendingPositionsRef = useRef(null);

  const [jumpMessage, setJumpMessage] = useState("");
  const prevRoomRef = useRef(null);
  const lastProcessedMoveRef = useRef(""); 

  const [countdown, setCountdown] = useState(null);
  const finalizeCalledRef = useRef(false);

  // Chat States
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const playerId = getPlayerId();
  
  const [playerName, setPlayerName] = useState(
    localStorage.getItem("playerName") || ""
  );

  const isMyTurn =
    roomData?.status === "playing" && roomData?.currentTurn === playerId;

  const getName = (pid) => roomData?.playerNames?.[pid] || pid;
  const currentTurnName = roomData?.currentTurn ? getName(roomData.currentTurn) : "";

  useEffect(() => {
    localStorage.setItem("playerName", playerName);
  }, [playerName]);

  const onCreateRoom = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name first");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const id = await createRoom(playerId, playerName.trim());
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
      await joinRoom(joinId.trim(), playerId, playerName.trim());
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

  // Callback triggered by Dice.jsx exactly when the spin animation completes
  const handleRollComplete = () => {
    diceFinishedRef.current = true;
    
    // Instantly pass the new positions down so the Board can start its stepping animation!
    if (pendingPositionsRef.current) {
      setDisplayPositions(pendingPositionsRef.current);
    }
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

    // Immediately sync positions if joining a game already in progress
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
      // Catch-all to ensure board resets immediately if a new game starts
      setDisplayPositions(roomData.positions);
    }

    prevRoomRef.current = roomData;

    // Store positions as pending. 
    // The Dice component triggers the actual UI update via handleRollComplete.
    if (roomData?.positions) {
      pendingPositionsRef.current = roomData.positions;
      diceFinishedRef.current = false;
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
      
      <input
        placeholder="Enter your name (e.g. Mau)"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      <br />
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

          {roomData.positions && (
            <Board
              key={activeRoomId}
              positions={displayPositions}
              playerNames={roomData?.playerNames || {}}
              roomData={roomData}
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