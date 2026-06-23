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

export type MessageReply = {
  id: string;
  text: string;
  playerId: string;
  playerName: string;
};

export type RoomMessage = {
  id?: string;
  playerId: string;
  playerName: string;
  text: string;
  at?: any;
  clientAt: number;
  replyTo?: MessageReply | null;
  isPending?: boolean; // Used for Optimistic UI
};

/**
 * Safely parses Firestore timestamps to milliseconds (Extracted for shared use)
 */
export function toMillis(at: any): number {
  if (!at) return 0;
  if (typeof at?.toDate === "function") return at.toDate().getTime();
  if (typeof at?.seconds === "number") {
    return at.seconds * 1000 + Math.floor((at.nanoseconds ?? 0) / 1e6);
  }
  const t = new Date(at).getTime();
  return Number.isFinite(t) ? t : 0;
}

const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("Server connection timed out (it may be waking up). Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(id);
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
  const safeName = (playerName || playerId).trim().slice(0, 40);
  const safeColor = (playerColor || "#888").trim();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error("Room not found");

    const room = snap.data() as Room;
    const alreadyIn = (room.players || []).includes(playerId);

    if (!alreadyIn) {
      if (room.status !== "waiting") throw new Error("Game already started");
      if ((room.players?.length || 0) >= 8) throw new Error("Room is full");
    }

    transaction.update(roomRef, {
      ...(alreadyIn ? {} : { players: arrayUnion(playerId) }),
      [`playerNames.${playerId}`]: safeName,
      [`playerColors.${playerId}`]: safeColor,
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
    const players = room.players || [];

    if (!players.includes(playerId)) return;

    const updatedPlayers = players.filter((p) => p !== playerId);

    if (updatedPlayers.length === 0) {
      transaction.delete(roomRef);
      return;
    }

    // FIX 9: Compute next turn explicitly from original order
    const oldIdx = players.indexOf(room.currentTurn);
    const nextId = players[(oldIdx + 1) % players.length];
    const nextTurn = updatedPlayers.includes(nextId) ? nextId : updatedPlayers[0];

    const newHostId = room.hostId === playerId ? updatedPlayers[0] : room.hostId;
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

    if ((room.players?.length || 0) < 2) {
      transaction.update(roomRef, {
        status: "waiting",
        countdownEndsAt: null,
        updatedAt: serverTimestamp(),
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

export async function sendMessage(
  roomId: string,
  playerId: string,
  playerName: string,
  text: string,
  replyTo?: MessageReply | null
) {
  const cleanText = (text ?? "").trim();
  if (!cleanText) return;
  if (cleanText.length > 1000) throw new Error("Message too long (max 1000 chars)");

  await addDoc(collection(db, "rooms", roomId, "messages"), {
    playerId,
    playerName: (playerName || playerId).slice(0, 40),
    text: cleanText,
    at: serverTimestamp(),
    clientAt: Date.now(),
    replyTo: replyTo || null,
  });
}

export function subscribeMessages(roomId: string, cb: (msgs: RoomMessage[]) => void) {
  const q = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("at", "asc"),
    limitToLast(50)
  );

  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data({ serverTimestamps: "estimate" }) as RoomMessage),
      }));

      msgs.sort((a, b) => {
        const da = toMillis(a.at) || a.clientAt;
        const db = toMillis(b.at) || b.clientAt;
        return da - db;
      });

      cb(msgs);
    },
    (error) => {
      console.error("❌ [subscribeMessages] Snapshot error:", error);
      cb([]);
    }
  );
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