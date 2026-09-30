// Live Ludo room: Firestore subscription + server actions.
//
// - Snapshots and action replies both carry the room `version`; anything
//   older than what we already show is ignored (out-of-order / duplicate).
// - Entering the room always (re)joins, so a refresh or a dropped connection
//   resumes from the current authoritative state.
// - When a turn's deadline passes, members ask the server to resolve it; the
//   server checks the deadline itself, so an early or duplicate poke is harmless.
import { useCallback, useEffect, useRef, useState } from "react";
import { LudoApiError, sendLudoAction, subscribeLudoRoom, type TimedReply } from "./api";
import { currentPlayerId } from "./state";
import type { LudoAction, LudoRoom } from "./types";

const OFFLINE_GRACE_MS = 2000;

type Options = {
  /** Empty when no Ludo room is open (the hook then does nothing). */
  roomId: string;
  playerId: string;
  playerName: string;
  /** Leave the room screen, optionally explaining why. */
  onExit: (message?: string) => void;
};

export function useLudoRoom({ roomId, playerId, playerName, onExit }: Options) {
  const [room, setRoom] = useState<LudoRoom | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState<LudoAction["type"] | null>(null);
  const [error, setError] = useState("");
  const roomRef = useRef<LudoRoom | null>(null);
  const clockOffsetRef = useRef(0); // server clock minus local clock
  const leavingRef = useRef(false);
  const onExitRef = useRef(onExit);
  const nameRef = useRef(playerName);
  useEffect(() => {
    onExitRef.current = onExit;
    nameRef.current = playerName;
  });

  const accept = useCallback((next: LudoRoom) => {
    const current = roomRef.current;
    if (current && current.id === next.id && next.version <= current.version) return;
    roomRef.current = next;
    setRoom(next);
  }, []);

  const noteReply = useCallback(
    ({ reply, sentAt, receivedAt }: TimedReply) => {
      clockOffsetRef.current = reply.serverTime - (sentAt + receivedAt) / 2;
      if (reply.room) accept({ ...reply.room, id: reply.roomId });
    },
    [accept]
  );

  // Live updates
  useEffect(() => {
    roomRef.current = null;
    leavingRef.current = false;
    setRoom(null);
    setError("");
    setOffline(false);
    if (!roomId) return;
    let hadRoom = false;
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeLudoRoom(
      roomId,
      (data, fromCache) => {
        clearTimeout(offlineTimer);
        if (fromCache) offlineTimer = setTimeout(() => setOffline(true), OFFLINE_GRACE_MS);
        else setOffline(false);
        if (!data) {
          if (hadRoom && !fromCache && !leavingRef.current) onExitRef.current("This room no longer exists.");
          return;
        }
        if (data.game !== "ludo") return onExitRef.current("That room code is for a different game.");
        hadRoom = true;
        accept(data);
      },
      () => setOffline(true)
    );
    return () => {
      clearTimeout(offlineTimer);
      unsubscribe();
    };
  }, [roomId, accept]);

  // (Re)join on entry: confirms our seat and syncs the server clock.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    sendLudoAction(roomId, { type: "join", name: nameRef.current })
      .then((reply) => {
        if (!cancelled) noteReply(reply);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e instanceof LudoApiError ? e : null;
        // Connection trouble: stay and keep listening; anything else means we can't be here.
        if (!err || err.code === "NETWORK" || err.status >= 500) setError(err?.message || "Couldn't reach the game server.");
        else onExitRef.current(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, noteReply]);

  /** Sends an action. Game moves carry the version they were decided on. */
  const act = useCallback(
    async (action: LudoAction, { versioned = false } = {}) => {
      const current = roomRef.current;
      if (!current) return false;
      setPending(action.type);
      setError("");
      try {
        noteReply(await sendLudoAction(roomId, action, versioned ? current.version : undefined));
        return true;
      } catch (e) {
        const err = e instanceof LudoApiError ? e : null;
        setError(err?.message || "Something went wrong. Please try again.");
        return false;
      } finally {
        setPending(null);
      }
    },
    [roomId, noteReply]
  );

  const leave = useCallback(async () => {
    leavingRef.current = true;
    try {
      await sendLudoAction(roomId, { type: "leave" });
    } catch {
      // Leave locally anyway; if the server never heard, the turn timer
      // eventually removes the empty seat.
    }
    onExitRef.current();
  }, [roomId]);

  const serverNow = useCallback(() => Date.now() + clockOffsetRef.current, []);
  const clearError = useCallback(() => setError(""), []);

  // Resolve expired turns. The player whose turn it is pokes first; others
  // follow a moment later in case that player is gone.
  const game = room?.ludo.game;
  const deadline = room?.status === "playing" ? game?.turn.deadline ?? null : null;
  const isMember = Boolean(room?.players.includes(playerId));
  const version = room?.version;
  const mine = game ? currentPlayerId(game) === playerId : false;
  useEffect(() => {
    if (deadline == null || !isMember || version == null) return;
    let timer: ReturnType<typeof setTimeout>;
    const poke = async () => {
      try {
        noteReply(await sendLudoAction(roomId, { type: "timeout" }, version));
      } catch (e) {
        if (e instanceof LudoApiError && e.code === "TOO_EARLY" && e.retryInMs != null) {
          timer = setTimeout(poke, e.retryInMs + 250);
        }
        // STALE / GAME_OVER: someone else already resolved it.
      }
    };
    const margin = mine ? 250 : 1500 + Math.random() * 1500;
    timer = setTimeout(poke, Math.max(0, deadline - serverNow() + margin));
    return () => clearTimeout(timer);
  }, [deadline, isMember, version, mine, roomId, noteReply, serverNow]);

  return { room, offline, pending, error, clearError, act, leave, serverNow };
}
