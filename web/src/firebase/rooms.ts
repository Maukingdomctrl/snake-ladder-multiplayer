import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  query,
  orderBy,
  runTransaction,
} from "firebase/firestore";
import { db } from "./index";

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
};

const SNAKES_LADDERS: Record<number, number> = {
  8: 26, 19: 38, 28: 53, 21: 82, 36: 57, 43: 77, 50: 91, 54: 88, 61: 99, 62: 95,
  46: 15, 48: 9, 52: 11, 59: 18, 64: 24, 68: 2, 69: 33, 83: 22, 89: 51, 93: 37, 98: 13,
};

/**
 * Creates a unique 4-digit multiplayer game room.
 * We use the full URL so the Discord SDK tunnel intercepts it automatically.
 */
export async function createRoom(hostId: string, hostName: string, hostColor: string) {
  console.log("➡️ [createRoom] Pinging Render server...");
  
  try {
    // By using the full URL that matches your URL Mapping target,
    // the Discord proxy will intercept and tunnel this request.
    const response = await fetch("/render/createRoom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostId, hostName, hostColor }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ [createRoom] Success! Room ${data.roomId} created.`);
    
    return data.roomId; 
  } catch (error) {
    console.error("❌ [createRoom] Connection failed:", error);
    throw error;
  }
}

/**
 * Allows a second or consecutive player to join an existing room
 */
export async function joinRoom(roomId: string, playerId: string, playerName: string, playerColor: string) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);
    
    if (!snap.exists()) throw new Error("Room not found");

    const room = snap.data() as Room;
    if (room.status !== "waiting") throw new Error("Game already started");
    if (room.players?.includes(playerId)) return;
    if (room.players?.length >= 8) throw new Error("Room is full");

    await updateDoc(roomRef, {
      players: arrayUnion(playerId),
      [`playerNames.${playerId}`]: playerName || playerId,
      [`playerColors.${playerId}`]: playerColor,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Listens to active metadata changes for a game room in real time
 */
export function subscribeRoom(roomId: string, cb: (room: Room | null) => void) {
  return onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (!snap.exists()) return cb(null);
    cb({ id: snap.id, ...(snap.data() as Room) });
  });
}

/**
 * Shifts room state into a 5-second countdown window
 */
export async function startGame(roomId: string, playerId: string) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("Room not found");

  const room = snap.data() as Room;
  if (room.hostId !== playerId) throw new Error("Only host can start");
  if (!room.players || room.players.length < 2) throw new Error("Need at least 2 players");

  await updateDoc(roomRef, {
    status: "countdown",
    countdownEndsAt: Date.now() + 5000,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Transitions game from countdown mode into full active play context
 */
export async function finalizeGameStart(roomId: string) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as Room;
  if (room.status !== "countdown" || (room.countdownEndsAt ?? 0) > Date.now()) return;

  await updateDoc(roomRef, {
    status: "playing",
    currentTurn: room.players[0],
    positions: Object.fromEntries((room.players || []).map((p) => [p, 1])),
    countdownEndsAt: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Performs thread-safe transactional dice mechanics
 */
export async function rollDice(roomId: string, playerId: string) {
  const roomRef = doc(db, "rooms", roomId);
  
  const dice = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error("Room not found");
    
    const room = snap.data() as Room;
    if (room.status !== "playing" || room.currentTurn !== playerId) throw new Error("Invalid turn");
    
    const players = room.players || [];
    const rolledDice = Math.floor(Math.random() * 6) + 1;
    const nextTurn = players[(players.indexOf(playerId) + 1) % players.length];
    
    const currentPos = room.positions?.[playerId] ?? 1;
    const movedPos = Math.min(100, currentPos + rolledDice);
    const newPos = SNAKES_LADDERS[movedPos] ?? movedPos;
    const finished = newPos >= 100;
    
    transaction.update(roomRef, {
      [`positions.${playerId}`]: newPos,
      currentTurn: finished ? playerId : nextTurn,
      status: finished ? "finished" : "playing",
      winnerId: finished ? playerId : null,
      lastDice: rolledDice,
      lastRolledBy: playerId,
      lastFrom: currentPos,
      updatedAt: serverTimestamp(),
    });
    return rolledDice;
  });

  await addDoc(collection(db, "rooms", roomId, "moves"), { playerId, dice, at: serverTimestamp() });
  return dice;
}

export async function sendMessage(roomId: string, playerId: string, playerName: string, text: string) {
  await addDoc(collection(db, "rooms", roomId, "messages"), { playerId, playerName, text, at: serverTimestamp() });
}

export function subscribeMessages(roomId: string, cb: (msgs: any[]) => void) {
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("at", "asc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/**
 * Retrieves the roomId associated with a given Discord instanceId
 */
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

/**
 * Links a generated roomId to a specific Discord instanceId
 */
export async function setInstanceRoom(instanceId: string, roomId: string): Promise<void> {
  try {
    const instanceRef = doc(db, "instances", instanceId);
    await setDoc(instanceRef, { roomId, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("❌ [setInstanceRoom] Error setting instance room:", error);
    throw error;
  }
}