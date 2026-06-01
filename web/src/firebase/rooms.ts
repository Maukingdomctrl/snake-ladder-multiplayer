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
} from "firebase/firestore";
import { db } from "./index";


export type RoomStatus = "waiting" | "playing" | "finished";

export type Room = {
  hostId: string;
  players: string[];
  status: RoomStatus;
  currentTurn: string;
  createdAt: unknown;
};

export async function createRoom(playerId: string) {
  const roomRef = doc(collection(db, "rooms"));
  const roomId = roomRef.id;

  const room: Room = {
    hostId: playerId,
    players: [playerId],
    status: "waiting",
    currentTurn: playerId,
    createdAt: serverTimestamp(),
  };

  await setDoc(roomRef, room);
  return roomId;
}

export async function joinRoom(roomId: string, playerId: string) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);

  if (!snap.exists()) throw new Error("Room not found");

  await updateDoc(roomRef, {
    players: arrayUnion(playerId),
  });
}

export function subscribeRoom(
  roomId: string,
  cb: (room: (Room & { id: string }) | null) => void
) {
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

  if (!room.players || room.players.length < 2) {
    throw new Error("Need at least 2 players");
  }

  await updateDoc(roomRef, {
    status: "playing",
    currentTurn: room.players[0],
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

  await updateDoc(roomRef, {
    currentTurn: nextTurn,
  });

  await addDoc(collection(db, "rooms", roomId, "moves"), {
    playerId,
    dice,
    at: serverTimestamp(),
  });

  return dice;
}

