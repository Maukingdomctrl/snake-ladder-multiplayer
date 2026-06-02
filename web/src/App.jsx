import { useEffect, useState } from "react";
import "./App.css";
import {
  createRoom,
  joinRoom,
  subscribeRoom,
  startGame,
  rollDice,
} from "./firebase/rooms";

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

  const playerId = getPlayerId();
  const isMyTurn =
    roomData?.status === "playing" && roomData?.currentTurn === playerId;

  const onCreateRoom = async () => {
    setLoading(true);
    setError("");
    try {
      const id = await createRoom(playerId);
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
    setLoading(true);
    setError("");
    try {
      await joinRoom(joinId.trim(), playerId);
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

  useEffect(() => {
    if (!activeRoomId) return;

    const unsub = subscribeRoom(activeRoomId, (room) => {
      setRoomData(room);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [activeRoomId]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Snake & Ladder Multiplayer</h1>

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
          <p><b>ID:</b> {roomData.id}</p>
          <p><b>Status:</b> {roomData.status}</p>
          <p><b>Host:</b> {roomData.hostId}</p>
          <p><b>Current Turn:</b> {roomData.currentTurn}</p>
          <p><b>Players:</b> {roomData.players?.join(", ")}</p>
        </div>
      )}

      {roomData?.status === "waiting" && (
        <button onClick={onStartGame} disabled={loading} style={{ marginTop: 8 }}>
          Start Game
        </button>
      )}

      {isMyTurn && (
        <button onClick={onRollDice} disabled={loading} style={{ marginTop: 8, marginLeft: 8 }}>
          Roll Dice
        </button>
      )}

      {roomData?.lastDice != null && (
        <p style={{ marginTop: 8 }}>
          <b>Last Dice:</b> {roomData.lastDice}
          {roomData?.lastRolledBy ? ` (by ${roomData.lastRolledBy})` : ""}
        </p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
