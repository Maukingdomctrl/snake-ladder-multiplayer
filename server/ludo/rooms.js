// Ludo rooms: lobby management and the single entry point for every player
// action. Pure — takes the stored room and returns the next room — so the
// same code runs inside a Firestore transaction and in tests.
//
// Room document (rooms/{code}, shared code space with Snakes & Ladders):
//   game: "ludo"
//   hostId, players[], playerNames{}, playerColors{}   — also read by chat
//   status: "waiting" | "playing" | "finished"
//   version: number   — bumped on every accepted action
//   ludo: { settings, seats[{ id, color, ready }], game (engine state) | null,
//           recentActions[{ id, by }] }
"use strict";

const engine = require("./engine");

const { LudoError, COLORS, SEAT_COLORS } = engine;

// Readable text colours for each seat (chat names, header dots).
const CHAT_COLORS = Object.freeze({ red: "#d6343a", green: "#1a8a4a", yellow: "#b98a00", blue: "#2a64c8" });
const NAME_MAX = 20;
const MAX_RECENT_ACTIONS = 40;
const ACTION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
// Actions decided on a specific game state must name the version they saw.
const GAME_ACTIONS = new Set(["roll", "move", "timeout"]);
// Returned by a handler when the action changes nothing (no version bump).
const NO_CHANGE = Symbol("no-change");

function cleanName(name) {
  const s = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return s || "Player";
}

function seatOf(room, uid) {
  return room.ludo.seats.find((s) => s.id === uid) || null;
}

function freeColor(room) {
  const taken = new Set(room.ludo.seats.map((s) => s.color));
  const preferred = [...SEAT_COLORS[room.ludo.settings.maxPlayers], ...COLORS];
  return preferred.find((c) => !taken.has(c)) || null;
}

function requireLobby(room) {
  if (room.status !== "waiting") throw new LudoError("GAME_STARTED", "The game has already started.", 409);
}

function requireHost(room, uid) {
  if (room.hostId !== uid) throw new LudoError("NOT_HOST", "Only the host can do that.", 403);
}

function requireMember(room, uid) {
  const seat = seatOf(room, uid);
  if (!seat) throw new LudoError("NOT_IN_ROOM", "You are not in this room.", 403);
  return seat;
}

function requireGame(room) {
  if (!room.ludo.game) throw new LudoError("NOT_PLAYING", "The game hasn't started yet.", 409);
  return room.ludo.game;
}

/** Removes a member from the lobby lists (seats, players, names, colours). */
function dropMember(room, uid, { keepName = false } = {}) {
  room.ludo.seats = room.ludo.seats.filter((s) => s.id !== uid);
  room.players = room.players.filter((p) => p !== uid);
  if (!keepName) {
    delete room.playerNames[uid];
    delete room.playerColors[uid];
  }
  if (room.hostId === uid && room.ludo.seats.length > 0) {
    room.hostId = room.ludo.seats[0].id;
    room.ludo.seats[0].ready = true;
  }
}

// ── Room creation ────────────────────────────────────────────────────────────

function createRoom({ uid, name, maxPlayers = 4 }) {
  const settings = engine.normalizeSettings({ maxPlayers });
  const color = SEAT_COLORS[settings.maxPlayers][0];
  return {
    game: "ludo",
    hostId: uid,
    players: [uid],
    playerNames: { [uid]: cleanName(name) },
    playerColors: { [uid]: CHAT_COLORS[color] },
    status: "waiting",
    version: 1,
    ludo: {
      settings,
      seats: [{ id: uid, color, ready: true }], // the host is always ready
      game: null,
      recentActions: [],
    },
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────

const handlers = {
  join(room, uid, action) {
    const seat = seatOf(room, uid);
    if (seat) {
      // Rejoining (refresh, new tab, reconnect): same seat, current state.
      const name = cleanName(action.name ?? room.playerNames[uid]);
      if (name === room.playerNames[uid]) return NO_CHANGE;
      room.playerNames[uid] = name;
      return;
    }
    if (room.status !== "waiting") {
      const played = room.ludo.game?.players.some((p) => p.id === uid);
      if (played) throw new LudoError("LEFT_GAME", "You left this game, so you can't rejoin it.", 409);
      throw new LudoError("GAME_STARTED", "This game has already started.", 409);
    }
    if (room.ludo.seats.length >= room.ludo.settings.maxPlayers) {
      throw new LudoError("ROOM_FULL", "This room is full.", 409);
    }
    const color = freeColor(room);
    room.ludo.seats.push({ id: uid, color, ready: false });
    room.players.push(uid);
    room.playerNames[uid] = cleanName(action.name);
    room.playerColors[uid] = CHAT_COLORS[color];
  },

  ready(room, uid, action) {
    requireLobby(room);
    const seat = requireMember(room, uid);
    if (typeof action.ready !== "boolean") throw new LudoError("BAD_REQUEST", "ready must be true or false");
    if (room.hostId !== uid) seat.ready = action.ready;
  },

  color(room, uid, action) {
    requireLobby(room);
    const seat = requireMember(room, uid);
    if (!COLORS.includes(action.color)) throw new LudoError("BAD_REQUEST", "Unknown colour.");
    if (seat.color === action.color) return NO_CHANGE;
    if (room.ludo.seats.some((s) => s.color === action.color)) {
      throw new LudoError("COLOR_TAKEN", "That colour is already taken.", 409);
    }
    seat.color = action.color;
    room.playerColors[uid] = CHAT_COLORS[action.color];
  },

  settings(room, uid, action) {
    requireLobby(room);
    requireHost(room, uid);
    const patch = {};
    if (action.maxPlayers !== undefined) patch.maxPlayers = action.maxPlayers;
    if (action.turnSeconds !== undefined) patch.turnSeconds = action.turnSeconds;
    const next = engine.normalizeSettings({ ...room.ludo.settings, ...patch });
    if (next.maxPlayers < room.ludo.seats.length) {
      throw new LudoError("TOO_MANY_PLAYERS", `There are already ${room.ludo.seats.length} players in the room.`, 409);
    }
    room.ludo.settings = next;
  },

  start(room, uid, action, ctx) {
    requireLobby(room);
    requireHost(room, uid);
    const { seats, settings } = room.ludo;
    if (seats.length < settings.maxPlayers) {
      throw new LudoError("NOT_ENOUGH_PLAYERS", `Waiting for ${settings.maxPlayers - seats.length} more player(s).`, 409);
    }
    if (!seats.every((s) => s.ready)) throw new LudoError("NOT_READY", "Everyone needs to be ready.", 409);
    room.ludo.game = engine.createGame({
      players: seats.map((s) => ({ id: s.id, color: s.color })),
      settings,
      rng: ctx.rng,
      now: ctx.now,
    });
    room.status = "playing";
  },

  roll(room, uid, action, ctx) {
    room.ludo.game = engine.roll(requireGame(room), uid, ctx);
    room.status = room.ludo.game.status;
  },

  move(room, uid, action, ctx) {
    room.ludo.game = engine.move(requireGame(room), uid, action.token, ctx);
    room.status = room.ludo.game.status;
  },

  timeout(room, uid, action, ctx) {
    requireMember(room, uid);
    room.ludo.game = engine.timeout(requireGame(room), ctx);
    room.status = room.ludo.game.status;
    // Players removed for inactivity also leave the room's member lists.
    for (const p of room.ludo.game.players) {
      if (p.status === "left" && seatOf(room, p.id)) dropMember(room, p.id, { keepName: true });
    }
  },

  leave(room, uid, action, ctx) {
    if (!seatOf(room, uid)) return NO_CHANGE;
    const inGame = room.ludo.game && room.ludo.game.players.some((p) => p.id === uid);
    if (inGame && room.status === "playing") {
      room.ludo.game = engine.removePlayer(room.ludo.game, uid, "left", ctx);
      room.status = room.ludo.game.status;
    }
    // Names stay while a game record still mentions this player.
    dropMember(room, uid, { keepName: Boolean(inGame) });
  },

  restart(room, uid) {
    requireHost(room, uid);
    if (room.status !== "finished") throw new LudoError("NOT_FINISHED", "The game is still going.", 409);
    const members = new Set(room.ludo.seats.map((s) => s.id));
    for (const id of Object.keys(room.playerNames)) {
      if (!members.has(id)) {
        delete room.playerNames[id];
        delete room.playerColors[id];
      }
    }
    room.ludo.seats = room.ludo.seats.map((s) => ({ ...s, ready: s.id === room.hostId }));
    room.ludo.settings = { ...room.ludo.settings, maxPlayers: Math.max(2, room.ludo.seats.length) };
    room.ludo.game = null;
    room.status = "waiting";
  },
};

/**
 * Applies one player action to a room.
 * request: { type, actionId, expectedVersion?, ...payload }
 * Returns { room } (the next room to store), { room, unchanged: true } when
 * nothing changed (including { duplicate: true } when this action id was
 * already applied), or { deleted: true } when the room empties.
 */
function applyAction(room, uid, request, ctx) {
  if (!room) throw new LudoError("ROOM_NOT_FOUND", "Room not found.", 404);
  if (room.game !== "ludo" || !room.ludo) throw new LudoError("NOT_LUDO", "That room code is for a different game.", 400);
  if (!request || typeof request !== "object") throw new LudoError("BAD_REQUEST", "Missing action.");

  const { type, actionId, expectedVersion } = request;
  const handler = Object.prototype.hasOwnProperty.call(handlers, type) ? handlers[type] : null;
  if (!handler) throw new LudoError("BAD_REQUEST", "Unknown action.");
  if (typeof actionId !== "string" || !ACTION_ID_RE.test(actionId)) {
    throw new LudoError("BAD_REQUEST", "Missing or invalid action id.");
  }

  // Retried request whose first attempt already went through: report success
  // with the current state instead of applying it twice.
  if (room.ludo.recentActions.some((a) => a.id === actionId && a.by === uid)) {
    return { room, unchanged: true, duplicate: true };
  }

  if (GAME_ACTIONS.has(type) && !Number.isInteger(expectedVersion)) {
    throw new LudoError("BAD_REQUEST", "Missing state version.");
  }
  if (expectedVersion !== undefined && expectedVersion !== room.version) {
    throw new LudoError("STALE", "The game moved on — showing the latest state.", 409, { version: room.version });
  }

  const next = structuredClone(room);
  if (handler(next, uid, request, ctx) === NO_CHANGE) return { room, unchanged: true };

  if (next.ludo.seats.length === 0) return { deleted: true };
  next.version = room.version + 1;
  next.ludo.recentActions = [...room.ludo.recentActions, { id: actionId, by: uid }].slice(-MAX_RECENT_ACTIONS);
  return { room: next };
}

module.exports = { createRoom, applyAction, CHAT_COLORS, NAME_MAX };
