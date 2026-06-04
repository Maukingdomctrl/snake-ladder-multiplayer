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
};

const SNAKES_LADDERS: Record<number, number> = {
  // Ladders
  3: 22,
  21: 41,
  34: 48,
  42: 59,
  54: 75,
  71: 91,

  // Snakes
  32: 10,
  49: 11,
  62: 19,
  64: 42,
  83: 14,
  88: 53,
  98: 13,
};

export async function createRoom(hostId: string, hostName: string) {
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
  });
  return roomRef.id;
}

export async function joinRoom(roomId: string, playerId: string, playerName: string) {
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
    countdownEndsAt: Date.now() + 5000, // 5 seconds
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
    positions: Object.fromEntries((room.players || []).map((p) => [p, 0])),
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
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("Room not found");

  const room = snap.data() as Room;
  if (room.status !== "playing") throw new Error("Game is not playing");
  if (room.currentTurn !== playerId) throw new Error("Not your turn");

  const players = room.players || [];
  if (players.length < 2) throw new Error("Need at least 2 players");

  const dice = Math.floor(Math.random() * 6) + 1;
  const currentIndex = players.indexOf(playerId);
  const nextIndex = (currentIndex + 1) % players.length;
  const nextTurn = players[nextIndex];

  const currentPos = room.positions?.[playerId] ?? 0;
  const movedPos = Math.min(100, currentPos + dice);
  const jumpedPos = SNAKES_LADDERS[movedPos] ?? movedPos;
  const newPos = jumpedPos;
  const finished = newPos >= 100;

  await updateDoc(roomRef, {
    [`positions.${playerId}`]: newPos,
    currentTurn: finished ? playerId : nextTurn,
    status: finished ? "finished" : "playing",
    winnerId: finished ? playerId : null,
    lastDice: dice,
    lastRolledBy: playerId,
    lastFrom: currentPos,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, "rooms", roomId, "moves"), {
    playerId,
    dice,
    from: currentPos,
    movedTo: movedPos,
    finalTo: newPos,
    jumped: jumpedPos !== movedPos,
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