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

/**
 * Creates a unique 4-digit multiplayer game room
 */
export async function createRoom(hostId: string, hostName: string, hostColor: string) {
  let roomId = "";
  let roomRef = doc(db, "rooms", "placeholder");
  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  console.log("➡️ [createRoom] Initiating unique Room ID lookup loop...");

  try {
    while (attempts < MAX_ATTEMPTS) {
      roomId = Math.floor(1000 + Math.random() * 9000).toString();
      roomRef = doc(db, "rooms", roomId);
      
      console.log(`[createRoom] Testing availability for Room ID: ${roomId} (Attempt ${attempts + 1})`);
      const snap = await getDoc(roomRef);
      
      if (!snap.exists()) {
        break; // Unique room ID found!
      }
      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      throw new Error("Servers are currently at maximum capacity. Please try again in a moment.");
    }

    console.log(`🚀 [createRoom] Selected clean ID: ${roomId}. Dispatched setDoc initialization payload...`);

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

    console.log(`✅ [createRoom] Success! Room ${roomId} active in Firestore.`);
    return roomId;

  } catch (error) {
    console.error("❌ [createRoom] Operation aborted or blocked by CSP/Rules:", error);
    throw error;
  }
}

/**
 * Allows a second or consecutive player to join an existing room
 */
export async function joinRoom(roomId: string, playerId: string, playerName: string, playerColor: string) {
  console.log(`➡️ [joinRoom] Attempting to access Room ID: ${roomId} for player: ${playerId}...`);
  
  try {
    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);
    
    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as Room;
    const players = room.players || [];

    if (room.status !== "waiting") throw new Error("Game already started");
    if (players.includes(playerId)) {
      console.log(`[joinRoom] Player ${playerId} is already in the participant array.`);
      return;
    }
    if (players.length >= 8) throw new Error("Room is full");

    console.log(`🚀 [joinRoom] Verification clear. Appending player updates via updateDoc...`);

    await updateDoc(roomRef, {
      players: arrayUnion(playerId),
      [`playerNames.${playerId}`]: playerName || playerId,
      [`playerColors.${playerId}`]: playerColor,
      updatedAt: serverTimestamp(),
    });

    console.log(`✅ [joinRoom] Player ${playerId} successfully attached to Room ${roomId}.`);

  } catch (error) {
    console.error(`❌ [joinRoom] Failed to link player to Room ${roomId}:`, error);
    throw error;
  }
}

/**
 * Listens to active metadata changes for a game room in real time
 */
export function subscribeRoom(roomId: string, cb: (room: Room | null) => void) {
  console.log(`➡️ [subscribeRoom] Spawning live listener stream for Room: ${roomId}`);
  
  const roomRef = doc(db, "rooms", roomId);
  
  return onSnapshot(
    roomRef, 
    (snap) => {
      if (!snap.exists()) {
        console.warn(`[subscribeRoom] Stream broadcasted an empty or deleted snapshot for room: ${roomId}`);
        return cb(null);
      }
      cb({ id: snap.id, ...(snap.data() as Room) });
    },
    (error) => {
      console.error(`❌ [subscribeRoom Error] Realtime listening context failed for Room ${roomId}:`, error);
    }
  );
}

/**
 * Shifts room state into a 5-second countdown window
 */
export async function startGame(roomId: string, playerId: string) {
  console.log(`➡️ [startGame] Trigger call issued by Host/Player: ${playerId} on Room: ${roomId}`);

  try {
    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) throw new Error("Room not found");

    const room = snap.data() as Room;
    if (room.hostId !== playerId) throw new Error("Only host can start");
    if (!room.players || room.players.length < 2) throw new Error("Need at least 2 players");
    if (room.status !== "waiting") throw new Error("Game already started");

    console.log(`🚀 [startGame] Validations passed. Moving status sequence to countdown...`);

    await updateDoc(roomRef, {
      status: "countdown",
      countdownEndsAt: Date.now() + 5000,
      updatedAt: serverTimestamp(),
    });

    console.log(`✅ [startGame] State transitioned. Countdown initiated.`);

  } catch (error) {
    console.error(`❌ [startGame] Operation rejected:`, error);
    throw error;
  }
}

/**
 * Transitions game from countdown mode into full active play context
 */
export async function finalizeGameStart(roomId: string) {
  console.log(`➡️ [finalizeGameStart] Check loop requested for Room: ${roomId}`);

  try {
    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) throw new Error("Room not found");

    const room = snap.data() as Room;
    if (room.status !== "countdown") return;
    if ((room.countdownEndsAt ?? 0) > Date.now()) return;
    if (!room.players || room.players.length < 2) throw new Error("Need at least 2 players");
    if (!room.players.includes(room.hostId)) throw new Error("Host missing from room");

    console.log(`🚀 [finalizeGameStart] Countdown verified elapsed. Preparing initial match mappings...`);

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

    console.log(`✅ [finalizeGameStart] Room ${roomId} successfully forced to dynamic 'playing' state.`);

  } catch (error) {
    console.error(`❌ [finalizeGameStart] Failed to initialize board layout configurations:`, error);
    throw error;
  }
}

/**
 * Performs thread-safe transactional dice mechanics alongside step translations
 */
export async function rollDice(roomId: string, playerId: string) {
  console.log(`➡️ [rollDice] Player ${playerId} is attempting to roll inside Room ${roomId}`);
  const roomRef = doc(db, "rooms", roomId);
  
  try {
    const dice = await runTransaction(db, async (transaction) => {
      console.log(`[rollDice Transaction] Reading database state snapshot smoothly...`);
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error("Room not found");
      
      const room = snap.data() as Room;
      if (room.status !== "playing") throw new Error("Game is not playing");
      if (room.currentTurn !== playerId) throw new Error("Not your turn");
      
      const players = room.players || [];
      const rolledDice = Math.floor(Math.random() * 6) + 1;
      const currentIndex = players.indexOf(playerId);
      const nextTurn = players[(currentIndex + 1) % players.length];
      
      const currentPos = room.positions?.[playerId] ?? 1;
      const movedPos = Math.min(100, currentPos + rolledDice);
      const newPos = SNAKES_LADDERS[movedPos] ?? movedPos;
      const finished = newPos >= 100;
      
      console.log(`[rollDice Transaction] Evaluated: Roll=${rolledDice}, Landed=${movedPos}, Final=${newPos}`);

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

    console.log(`🚀 [rollDice] Transaction written safely. Adding analytical record to tracking ledger history...`);

    await addDoc(collection(db, "rooms", roomId, "moves"), {
      playerId,
      dice,
      at: serverTimestamp(),
    });

    console.log(`✅ [rollDice] Turn cycle successfully closed.`);
    return dice;

  } catch (error) {
    console.error(`❌ [rollDice Transaction] Structural failure or execution breakdown:`, error);
    throw error;
  }
}

/**
 * Appends standard textual records to the room's chat communication subcollection
 */
export async function sendMessage(roomId: string, playerId: string, playerName: string, text: string) {
  console.log(`➡️ [sendMessage] Dispatch configuration called for user: ${playerName}`);
  
  try {
    await addDoc(collection(db, "rooms", roomId, "messages"), {
      playerId,
      playerName,
      text,
      at: serverTimestamp()
    });
    console.log(`✅ [sendMessage] Payload appended cleanly to backend records.`);
  } catch (error) {
    console.error(`❌ [sendMessage] Transaction dropped or rejected:`, error);
    throw error;
  }
}

/**
 * Tracks and feeds message update lists sequentially back to UI layers
 */
export function subscribeMessages(roomId: string, cb: (msgs: any[]) => void) {
  console.log(`➡️ [subscribeMessages] Spawning chat monitoring framework connection to Room ${roomId}`);
  
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("at", "asc"));
  
  return onSnapshot(
    q, 
    (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error(`❌ [subscribeMessages Error] Stream drop occurred inside chat room tracking:`, error);
    }
  );
}