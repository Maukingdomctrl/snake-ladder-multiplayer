// Talking to the game server and Firestore for Ludo. The server decides
// everything; the client sends intents and listens to the room document.
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { RENDER_URL, fetchWithTimeout } from "../../firebase/rooms";
import type { LudoAction, LudoRoom } from "./types";

export class LudoApiError extends Error {
  code: string;
  status: number;
  version?: number;
  retryInMs?: number;

  constructor(code: string, message: string, status: number, extra: { version?: number; retryInMs?: number } = {}) {
    super(message);
    this.name = "LudoApiError";
    this.code = code;
    this.status = status;
    this.version = extra.version;
    this.retryInMs = extra.retryInMs;
  }
}

export type ServerReply = {
  roomId: string;
  room?: Omit<LudoRoom, "id">;
  deleted?: boolean;
  duplicate?: boolean;
  serverTime: number;
};

/** A reply plus the local send/receive times, for estimating the server clock. */
export type TimedReply = { reply: ServerReply; sentAt: number; receivedAt: number };

export function newActionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

async function post(path: string, body: object, timeoutMs: number): Promise<TimedReply> {
  const user = auth.currentUser;
  if (!user) throw new LudoApiError("NOT_SIGNED_IN", "Please sign in first.", 401);
  const token = await user.getIdToken();
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${RENDER_URL}/ludo${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
      timeoutMs
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new LudoApiError("NETWORK", message || "Couldn't reach the game server. Check your connection.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (!data?.code) {
      const message =
        response.status === 404
          ? "Ludo isn't available on the game server yet. Please try again later."
          : `Server error: ${response.status}`;
      throw new LudoApiError("UNAVAILABLE", message, response.status);
    }
    throw new LudoApiError(data.code, data.error || "Something went wrong.", response.status, {
      version: data.version,
      retryInMs: data.retryInMs,
    });
  }
  return { reply: data as ServerReply, sentAt, receivedAt: Date.now() };
}

/** Creates a room. Long timeout: the free server instance may be waking up. */
export function createLudoRoom(name: string, maxPlayers: 2 | 3 | 4) {
  return post("/create", { name, maxPlayers }, 70000);
}

/**
 * Sends one action. A request that fails in transit is retried with the same
 * action id, so it can never be applied twice.
 */
export async function sendLudoAction(roomId: string, action: LudoAction, expectedVersion?: number): Promise<TimedReply> {
  const body = { roomId, action: { ...action, actionId: newActionId(), expectedVersion } };
  for (let attempt = 1; ; attempt++) {
    try {
      // Joining may wake a sleeping server instance; later actions are quick.
      return await post("/action", body, action.type === "join" ? 70000 : 20000);
    } catch (error) {
      if (!(error instanceof LudoApiError) || error.code !== "NETWORK" || attempt >= 2) throw error;
    }
  }
}

/** Which game a room code belongs to, or null if there's no such room. */
export async function peekRoomGame(roomId: string): Promise<"ludo" | "snakes" | null> {
  const snap = await getDoc(doc(db, "rooms", roomId));
  if (!snap.exists()) return null;
  return snap.data().game === "ludo" ? "ludo" : "snakes";
}

export function subscribeLudoRoom(
  roomId: string,
  onRoom: (room: LudoRoom | null, fromCache: boolean) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "rooms", roomId),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) return onRoom(null, snap.metadata.fromCache);
      onRoom({ ...(snap.data() as Omit<LudoRoom, "id">), id: snap.id }, snap.metadata.fromCache);
    },
    onError
  );
}
