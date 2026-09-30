// Remembers the Ludo room this browser is seated in, so a refresh or a
// reopened tab drops the player straight back into their game.
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

const KEY = "ludo:room";

export function rememberLudoRoom(roomId: string) {
  try {
    localStorage.setItem(KEY, roomId);
  } catch {
    // Private mode: no auto-resume, the room code still works
  }
}

export function forgetLudoRoom() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** The remembered room, if this player is still seated in a live game there. */
export async function findResumableLudoRoom(playerId: string): Promise<string | null> {
  let roomId: string | null = null;
  try {
    roomId = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!roomId) return null;
  try {
    const snap = await getDoc(doc(db, "rooms", roomId));
    const data = snap.exists() ? snap.data() : null;
    const seated = data?.game === "ludo" && data.status !== "finished" && (data.players ?? []).includes(playerId);
    if (seated) return roomId;
  } catch {
    return null; // offline: keep the memory and try next time
  }
  forgetLudoRoom();
  return null;
}
