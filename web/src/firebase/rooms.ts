import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  runTransaction,
  deleteField,
  limitToLast
} from "firebase/firestore";
import { db } from "./index";

const RENDER_URL = import.meta.env.PROD
  ? "https://snake-ladder-multiplayer-c5ai.onrender.com"
  : "/render";

export type RoomStatus = "waiting" | "countdown" | "playing" | "finished";

export type Room = {
  id?: string;
  hostId: string;
  players: string[];
  status: RoomStatus;
  currentTurn: string;
  createdAt?: any;
  updatedAt?: any;
  lastDice?: number | null;
  lastRolledBy?: string | null;
  lastFrom?: number | null;
  positions?: Record<string, number>;
  winnerId?: string | null;
  countdownEndsAt?: number | null;
  playerNames?: Record<string, string>;
  playerColors?: Record<string, string>;
  moveCount?: number;
};

const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === "AbortError") {
      throw new Error("Server connection timed out (it may be waking up). Please try again.");
    }
    throw error;
  }
};

export async function createRoom(hostId: string, hostName: string, hostColor: string, instanceId?: string) {
  try {
    const payload: any = { hostId, hostName, hostColor };
    if (instanceId) payload.instanceId = instanceId;

    const response = await fetchWithTimeout(`${RENDER_URL}/createRoom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.roomId; 
  } catch (error) {
    console.error("❌ [createRoom] Connection failed:", error);
    throw error;
  }
}

export async function joinRoom(roomId: string, playerId: string, playerName: string, playerColor: string) {
  const roomRef = doc(db, "rooms", roomId);
  
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error("Room not found");

    const room = snap.data() as Room;
    const alreadyIn = (room.players || []).includes(playerId);
    
    // FIX 1: Only enforce status and capacity if the player is NOT already in the room
    if (!alreadyIn) {
      if (room.status !== "waiting") throw new Error("Game already started");
      if ((room.players?.length || 0) >= 8) throw new Error("Room is full");
    }
    
    transaction.update(roomRef, {
      ...(alreadyIn ? {} : { players: arrayUnion(playerId) }),
      [`playerNames.${playerId}`]: playerName || playerId,
      [`playerColors.${playerId}`]: playerColor,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function leaveRoom(roomId: string, playerId: string) {
  const roomRef = doc(db, "rooms", roomId);
  
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) return;

    const room = snap.data() as Room;
    
    // FIX 3: Consistent null-safety on room.players
    const playerIndex = (room.players || []).indexOf(playerId);
    const updatedPlayers = (room.players || []).filter(p => p !== playerId);

    if (updatedPlayers.length === 0) {
      transaction.delete(roomRef);
      return;
    }

    const safeIndex = playerIndex > -1 ? playerIndex : 0;
    const nextTurn = room.currentTurn === playerId
      ? updatedPlayers[safeIndex % updatedPlayers.length] ?? updatedPlayers[0]
      : room.currentTurn;
      
    const newHostId = room.hostId === playerId ? updatedPlayers[0] : room.hostId;
    
    // FIX 2: Reset to "waiting" if a player drops to 1 during "countdown"
    let newStatus = room.status;
    let newCountdownEndsAt = room.countdownEndsAt;
    
    if (updatedPlayers.length === 1) {
      if (room.status === "playing") {
        newStatus = "finished";
      } else if (room.status === "countdown") {
        newStatus = "waiting";
        newCountdownEndsAt = null;
      }
    }

    transaction.update(roomRef, {
      players: updatedPlayers,
      currentTurn: nextTurn,
      hostId: newHostId,
      status: newStatus,
      countdownEndsAt: newCountdownEndsAt,
      winnerId: newStatus === "finished" ? updatedPlayers[0] : room.winnerId,
      [`playerNames.${playerId}`]: deleteField(),
      [`playerColors.${playerId}`]: deleteField(),
      [`positions.${playerId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}

export function subscribeRoom(roomId: string, cb: (room: Room | null) => void) {
  return onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (!snap.exists()) return cb(null);
    cb({ id: snap.id, ...(snap.data({ serverTimestamps: "estimate" }) as Room) });
  });
}

export async function startGame(roomId: string, playerId: string) {
  const roomRef = doc(db, "rooms", roomId);
  
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error("Room not found");
    
    const room = snap.data() as Room;
    if (room.hostId !== playerId) throw new Error("Only host can start");
    if (room.status !== "waiting" && room.status !== "finished")
      throw new Error("Game already in progress");
    if ((room.players?.length ?? 0) < 2) throw new Error("Need at least 2 players");
    
    transaction.update(roomRef, {
      status: "countdown",
      // Note: Client clock compromise. Acceptable for 5s UI countdowns, but server-side is ideal.
      countdownEndsAt: Date.now() + 5000, 
      updatedAt: serverTimestamp(),
    });
  });
}

export async function finalizeGameStart(roomId: string) {
  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) return;

    const room = snap.data() as Room;
    
    // FIX 2: Player-count guard. Abort if players dropped below 2 during countdown
    if ((room.players?.length || 0) < 2) {
      transaction.update(roomRef, {
        status: "waiting",
        countdownEndsAt: null,
      });
      return;
    }
    
    if (room.status !== "countdown" || (room.countdownEndsAt ?? 0) > Date.now()) {
      return;
    }

    transaction.update(roomRef, {
      status: "playing",
      currentTurn: room.players[0],
      positions: Object.fromEntries((room.players || []).map((p) => [p, 1])),
      countdownEndsAt: null,
      updatedAt: serverTimestamp(),
      winnerId: null,
      lastDice: null,
      lastFrom: null,
      lastRolledBy: null,
    });
  });
}

export async function rollDice(roomId: string, playerId: string) {
  try {
    const response = await fetchWithTimeout(`${RENDER_URL}/roll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, playerId }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ [rollDice] Error hitting server:", error);
    throw error;
  }
}

export async function sendMessage(roomId: string, playerId: string, playerName: string, text: string, replyTo?: any) {
  await addDoc(collection(db, "rooms", roomId, "messages"), { 
    playerId, 
    playerName, 
    text, 
    at: serverTimestamp(),
    replyTo: replyTo || null 
  });
}

export function subscribeMessages(roomId: string, cb: (msgs: any[]) => void) {
  const q = query(
    collection(db, "rooms", roomId, "messages"), 
    orderBy("at", "asc"),
    limitToLast(50)
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))));
}

export async function getInstanceRoom(instanceId: string): Promise<string | null> {
  try {
    const instanceRef = doc(db, "instances", instanceId);
    const snap = await getDoc(instanceRef);
    if (snap.exists()) {
      return snap.data().roomId || null;
    }
    return null;
  } catch (error) {
    console.error("❌ [getInstanceRoom] Error fetching instance:", error);
    return null;
  }
}

export async function setInstanceRoom(instanceId: string, roomId: string): Promise<void> {
  try {
    const instanceRef = doc(db, "instances", instanceId);
    await setDoc(instanceRef, { roomId, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("❌ [setInstanceRoom] Error setting instance room:", error);
    throw error;
  }
}