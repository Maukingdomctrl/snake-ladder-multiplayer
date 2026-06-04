import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
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
  // Ladders
  8: 26,
  19: 38,
  28: 53,
  21: 82,
  36: 57,
  43: 77,
  50: 91,
  54: 88,
  61: 99,
  62: 95,

  // Snakes
  46: 15,
  48: 9,
  52: 11,
  59: 18,
  64: 24,
  68: 2,
  69: 33,
  83: 22,
  89: 51,
  93: 37,
  98: 13,
};

export async function createRoom(hostId: string, hostName: string, hostColor: string) {
  const roomRef = doc(collection(db, "rooms"));
  await setDoc(roomRef, {
    hostId,
    players: [hostId],
    status: "waiting",
    currentTurn: hostId,
    lastDice: null,
    lastRolledBy: null,
    lastFrom: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    playerNames: {
      [hostId]: hostName || hostId,
    },
    playerColors: {
      [hostId]: hostColor,
    },
  });
  return roomRef.id;
}

export async function joinRoom(roomId: string, playerId: string, playerName: string, playerColor: string) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("Room not found");

  const room = snap.data() as Room;
  const players = room.players || [];

  if (room.status !== "waiting") throw new Error("Game already started");
  if (players.includes(playerId)) return;
  if (players.length >= 8) throw new Error("Room is full");

  await updateDoc(roomRef, {
    players: arrayUnion(playerId),
    [`playerNames.${playerId}`]: playerName || playerId,
    [`playerColors.${playerId}`]: playerColor,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeRoom(roomId: string, cb: (room: Room | null) => void) {
  const roomRef = doc(db, "rooms", roomId);
  return onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) return cb(null);
    cb({ id: snap.id, ...(snap.data() as Room) });
  });
}

export async function startGame(roomId: string, playerId: string) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("Room not found");

  const room = snap.data() as Room;
  if (room.hostId !== playerId) throw new Error("Only host can start");
  if (!room.players || room.players.length < 2) throw new Error("Need at least 2 players");
  if (room.status !== "waiting") throw new Error("Game already started");

  await updateDoc(roomRef, {
    status: "countdown",
    countdownEndsAt: Date.now() + 5000,
    updatedAt: serverTimestamp(),
  });
}

export async function finalizeGameStart(roomId: string) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("Room not found");

  const room = snap.data() as Room;
  if (room.status !== "countdown") return;
  if ((room.countdownEndsAt ?? 0) > Date.now()) return;
  if (!room.players || room.players.length < 2) throw new Error("Need at least 2 players");
  if (!room.players.includes(room.hostId)) throw new Error("Host missing from room");

  await updateDoc(roomRef, {
    status: "playing",
    currentTurn: room.players[0],
    positions: Object.fromEntries((room.players || []).map((p) => [p, 1])),
    lastDice: null,
    lastRolledBy: null,
    lastFrom: null,
    winnerId: null,
    countdownEndsAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function rollDice(roomId: string, playerId: string) {
  const roomRef = doc(db, "rooms", roomId);
  
  const dice = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error("Room not found");
    
    const room = snap.data() as Room;
    if (room.status !== "playing") throw new Error("Game is not playing");
    if (room.currentTurn !== playerId) throw new Error("Not your turn");
    
    const players = room.players || [];
    const dice = Math.floor(Math.random() * 6) + 1;
    const currentIndex = players.indexOf(playerId);
    const nextTurn = players[(currentIndex + 1) % players.length];
    
    const currentPos = room.positions?.[playerId] ?? 1;
    
    const movedPos = Math.min(100, currentPos + dice);
    const newPos = SNAKES_LADDERS[movedPos] ?? movedPos;
    const finished = newPos >= 100;
    
    transaction.update(roomRef, {
      [`positions.${playerId}`]: newPos,
      currentTurn: finished ? playerId : nextTurn,
      status: finished ? "finished" : "playing",
      winnerId: finished ? playerId : null,
      lastDice: dice,
      lastRolledBy: playerId,
      lastFrom: currentPos,
      updatedAt: serverTimestamp(),
    });
    
    return dice;
  });

  await addDoc(collection(db, "rooms", roomId, "moves"), {
    playerId,
    dice,
    at: serverTimestamp(),
  });

  return dice;
}

export async function sendMessage(roomId: string, playerId: string, playerName: string, text: string) {
  await addDoc(collection(db, "rooms", roomId, "messages"), {
    playerId,
    playerName,
    text,
    at: serverTimestamp()
  });
}

export function subscribeMessages(roomId: string, cb: (msgs: any[]) => void) {
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("at", "asc"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}