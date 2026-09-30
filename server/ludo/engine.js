// Ludo rules engine — pure and deterministic.
//
// Every function takes a game state and returns a NEW game state (the input
// is never mutated). Randomness and time are injected (`rng`, `now`) so the
// same inputs always produce the same result; the server passes a crypto RNG
// and its own clock, tests pass fixed sequences.
//
// Board model
// -----------
// The main track has 52 squares, numbered clockwise from Red's start square
// (index 0). Each colour starts at START_INDEX[colour]. A token's position is
// its `progress` along its own path:
//   -1        in its base (yard)
//   0..50     on the main track, absolute square (START_INDEX + progress) % 52
//   51..55    in its own coloured home column
//   56        finished (the centre home)
"use strict";

const COLORS = Object.freeze(["red", "green", "yellow", "blue"]);
const TOKENS_PER_PLAYER = 4;
const TRACK_LENGTH = 52;
const LAST_TRACK_PROGRESS = 50;
const HOME_PROGRESS = 56;
const BASE = -1;
const START_INDEX = Object.freeze({ red: 0, green: 13, yellow: 26, blue: 39 });
const STAR_INDICES = Object.freeze([8, 21, 34, 47]);
const MAX_EVENTS = 24;
// Extra time on every turn deadline so the dice/move animations don't eat
// into the player's thinking time.
const ANIMATION_GRACE_MS = 3000;

// Colours used for each table size: two players sit opposite each other.
const SEAT_COLORS = Object.freeze({
  2: Object.freeze(["red", "yellow"]),
  3: Object.freeze(["red", "green", "yellow"]),
  4: COLORS,
});

const DEFAULT_SETTINGS = Object.freeze({
  maxPlayers: 4,
  exitRolls: Object.freeze([6]), // dice values that bring a token out of base
  extraTurnOnSix: true,
  extraTurnOnCapture: true,
  extraTurnOnHome: true,
  maxConsecutiveSixes: 3, // the Nth six in a row forfeits the turn (0 = off)
  safeSquares: true, // start squares + star squares can't be captured on
  blockades: false, // two same-colour tokens block the square for others
  autoMove: true, // play the move automatically when there is only one choice
  turnSeconds: 30, // 0 = no turn timer
  maxMissedTurns: 3, // consecutive timeouts before a player is removed (0 = never)
  endCondition: "first", // "first": first player home wins; "all": play on for places
});

const TURN_SECONDS_CHOICES = Object.freeze([0, 15, 30, 45, 60]);

class LudoError extends Error {
  constructor(code, message, status = 400, extra = undefined) {
    super(message);
    this.name = "LudoError";
    this.code = code;
    this.status = status;
    if (extra) this.extra = extra;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

/** Validates settings, filling anything missing from the defaults. */
function normalizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, exitRolls: [...DEFAULT_SETTINGS.exitRolls] };
  const bools = [
    "extraTurnOnSix",
    "extraTurnOnCapture",
    "extraTurnOnHome",
    "safeSquares",
    "blockades",
    "autoMove",
  ];
  for (const key of bools) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") throw new LudoError("BAD_SETTINGS", `${key} must be true or false`);
      s[key] = input[key];
    }
  }
  if (input.maxPlayers !== undefined) {
    if (![2, 3, 4].includes(input.maxPlayers)) throw new LudoError("BAD_SETTINGS", "Players must be 2, 3 or 4");
    s.maxPlayers = input.maxPlayers;
  }
  if (input.turnSeconds !== undefined) {
    if (!TURN_SECONDS_CHOICES.includes(input.turnSeconds)) throw new LudoError("BAD_SETTINGS", "Unsupported turn timer");
    s.turnSeconds = input.turnSeconds;
  }
  if (input.maxConsecutiveSixes !== undefined) {
    if (![0, 2, 3].includes(input.maxConsecutiveSixes)) throw new LudoError("BAD_SETTINGS", "Unsupported six limit");
    s.maxConsecutiveSixes = input.maxConsecutiveSixes;
  }
  if (input.maxMissedTurns !== undefined) {
    if (!Number.isInteger(input.maxMissedTurns) || input.maxMissedTurns < 0 || input.maxMissedTurns > 10) {
      throw new LudoError("BAD_SETTINGS", "Unsupported missed-turn limit");
    }
    s.maxMissedTurns = input.maxMissedTurns;
  }
  if (input.exitRolls !== undefined) {
    const ok =
      Array.isArray(input.exitRolls) &&
      input.exitRolls.length > 0 &&
      input.exitRolls.every((v) => Number.isInteger(v) && v >= 1 && v <= 6);
    if (!ok) throw new LudoError("BAD_SETTINGS", "Unsupported exit rolls");
    s.exitRolls = [...new Set(input.exitRolls)].sort();
  }
  if (input.endCondition !== undefined) {
    if (!["first", "all"].includes(input.endCondition)) throw new LudoError("BAD_SETTINGS", "Unsupported end condition");
    s.endCondition = input.endCondition;
  }
  return s;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Absolute main-track square for a token, or null when it's not on the track. */
function trackIndex(color, progress) {
  if (progress < 0 || progress > LAST_TRACK_PROGRESS) return null;
  return (START_INDEX[color] + progress) % TRACK_LENGTH;
}

function isSafeIndex(index, settings) {
  if (!settings.safeSquares) return false;
  return STAR_INDICES.includes(index) || Object.values(START_INDEX).includes(index);
}

/** Colours still taking turns, in clockwise order. */
function activeColors(game) {
  return game.players.filter((p) => p.status === "active").map((p) => p.color);
}

function playerByColor(game, color) {
  return game.players.find((p) => p.color === color) || null;
}

function playerById(game, id) {
  return game.players.find((p) => p.id === id) || null;
}

/** All opponent tokens sitting on absolute track square `index`. */
function opponentsAt(game, color, index) {
  const hits = [];
  for (const p of game.players) {
    if (p.color === color || p.status === "left") continue;
    game.tokens[p.color].forEach((progress, token) => {
      if (trackIndex(p.color, progress) === index) hits.push({ color: p.color, token, from: progress });
    });
  }
  return hits;
}

/** True when an opponent has 2+ tokens on the square and blockades are on. */
function isBlockadeFor(game, color, index) {
  if (!game.settings.blockades) return false;
  const counts = {};
  for (const hit of opponentsAt(game, color, index)) {
    counts[hit.color] = (counts[hit.color] || 0) + 1;
    if (counts[hit.color] >= 2) return true;
  }
  return false;
}

// ── Legal moves ──────────────────────────────────────────────────────────────

/**
 * Every legal move for `color` with `dice`. The server is the only caller
 * that decides legality; clients just render the list it publishes.
 */
function getLegalMoves(game, color, dice) {
  const { settings } = game;
  const moves = [];
  const tokens = game.tokens[color];
  if (!tokens) return moves;

  tokens.forEach((from, token) => {
    if (from === HOME_PROGRESS) return;

    let to;
    if (from === BASE) {
      if (!settings.exitRolls.includes(dice)) return;
      to = 0;
    } else {
      to = from + dice;
      if (to > HOME_PROGRESS) return; // must land exactly on home
      // A blockade can't be passed (checked on every main-track square crossed)
      for (let step = from + 1; step < to && step <= LAST_TRACK_PROGRESS; step++) {
        if (isBlockadeFor(game, color, trackIndex(color, step))) return;
      }
    }

    let captures = [];
    const landing = trackIndex(color, to);
    if (landing !== null) {
      if (isBlockadeFor(game, color, landing)) return;
      if (!isSafeIndex(landing, settings)) captures = opponentsAt(game, color, landing);
    }

    moves.push({
      token,
      from,
      to,
      captures,
      exits: from === BASE,
      entersLane: from <= LAST_TRACK_PROGRESS && to > LAST_TRACK_PROGRESS,
      home: to === HOME_PROGRESS,
    });
  });
  return moves;
}

/** Moves are interchangeable when the tokens start on the same square. */
function hasSingleChoice(moves) {
  return moves.length > 0 && moves.every((m) => m.from === moves[0].from);
}

/** Deterministic pick used for auto-play (timeouts): the "best" legal move. */
function chooseBestMove(moves) {
  const score = (m) =>
    (m.captures.length ? 1000 : 0) +
    (m.home ? 500 : 0) +
    (m.exits ? 300 : 0) +
    (m.entersLane ? 200 : 0) +
    m.from;
  return [...moves].sort((a, b) => score(b) - score(a) || a.token - b.token)[0] || null;
}

// ── State helpers ────────────────────────────────────────────────────────────

function clone(game) {
  return structuredClone(game);
}

function deadlineFor(settings, now) {
  return settings.turnSeconds > 0 ? now + settings.turnSeconds * 1000 + ANIMATION_GRACE_MS : null;
}

function pushEvent(game, event, now) {
  game.eventSeq += 1;
  game.events.push({ seq: game.eventSeq, at: now, ...event });
  if (game.events.length > MAX_EVENTS) game.events.splice(0, game.events.length - MAX_EVENTS);
}

function startTurn(game, color, now, { extra = false } = {}) {
  game.turn = {
    color,
    phase: "roll",
    dice: null,
    legal: [],
    sixes: extra ? game.turn.sixes : 0,
    deadline: deadlineFor(game.settings, now),
  };
  if (!extra) game.turnNumber += 1;
}

/** Next colour clockwise after `color` that is still taking turns. */
function nextActiveColor(game, color) {
  const order = COLORS.filter((c) => game.players.some((p) => p.color === c));
  const start = order.indexOf(color);
  for (let i = 1; i <= order.length; i++) {
    const c = order[(start + i) % order.length];
    if (playerByColor(game, c).status === "active") return c;
  }
  return null;
}

function passTurn(game, now) {
  const next = nextActiveColor(game, game.turn.color);
  if (next) startTurn(game, next, now);
}

function finishGame(game, now) {
  game.status = "finished";
  // Anyone still playing is ranked by how far their tokens got.
  const remaining = game.players
    .filter((p) => p.status === "active")
    .sort((a, b) => totalProgress(game, b.color) - totalProgress(game, a.color));
  for (const p of remaining) {
    game.ranking.push(p.id);
    p.rank = game.ranking.length;
  }
  game.winnerId = game.ranking[0] || null;
  game.turn = { ...game.turn, phase: "over", dice: null, legal: [], deadline: null };
  pushEvent(game, { type: "end", winner: game.winnerId, ranking: [...game.ranking] }, now);
}

function totalProgress(game, color) {
  return game.tokens[color].reduce((sum, p) => sum + (p === BASE ? 0 : p + 1), 0);
}

/** Ends the game when its end condition is met. Returns true if it ended. */
function checkGameOver(game, now) {
  const stillPlaying = game.players.filter((p) => p.status === "active");
  const someoneFinished = game.players.some((p) => p.status === "finished");
  const over =
    stillPlaying.length === 0 ||
    (stillPlaying.length === 1 && game.players.length > 1) ||
    (game.settings.endCondition === "first" && someoneFinished);
  if (over) finishGame(game, now);
  return over;
}

// ── Validation ───────────────────────────────────────────────────────────────

function requireTurn(game, playerId, phase) {
  if (game.status !== "playing") throw new LudoError("GAME_OVER", "The game is over.", 409);
  const player = playerById(game, playerId);
  if (!player) throw new LudoError("NOT_IN_GAME", "You are not playing in this game.", 403);
  if (player.status === "left") throw new LudoError("LEFT_GAME", "You have left this game.", 403);
  if (game.turn.color !== player.color) throw new LudoError("NOT_YOUR_TURN", "It is not your turn.", 409);
  if (game.turn.phase !== phase) {
    const message = phase === "roll" ? "You already rolled — pick a token." : "Roll the dice first.";
    throw new LudoError("WRONG_PHASE", message, 409);
  }
  return player;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts a game. `players` is [{ id, color }]; colours must be distinct.
 * The first player is drawn with the injected RNG.
 */
function createGame({ players, settings, rng, now }) {
  const s = normalizeSettings(settings);
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    throw new LudoError("BAD_PLAYERS", "Ludo needs 2 to 4 players.");
  }
  const colors = players.map((p) => p.color);
  if (new Set(colors).size !== colors.length || !colors.every((c) => COLORS.includes(c))) {
    throw new LudoError("BAD_PLAYERS", "Every player needs a different colour.");
  }
  const ordered = [...players].sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
  const game = {
    status: "playing",
    settings: s,
    players: ordered.map((p) => ({ id: p.id, color: p.color, status: "active", missed: 0, rank: null })),
    tokens: Object.fromEntries(ordered.map((p) => [p.color, Array(TOKENS_PER_PLAYER).fill(BASE)])),
    turn: null,
    turnNumber: 0,
    winnerId: null,
    ranking: [],
    eventSeq: 0,
    events: [],
  };
  const first = ordered[rng.int(0, ordered.length)].color;
  game.turn = { color: first, sixes: 0 };
  startTurn(game, first, now);
  pushEvent(game, { type: "start", color: first }, now);
  return game;
}

/** Current player rolls. The dice value comes from the injected RNG only. */
function roll(game, playerId, { rng, now }) {
  const g = clone(game);
  const player = requireTurn(g, playerId, "roll");
  player.missed = 0;
  return doRoll(g, player, { rng, now, auto: false });
}

function doRoll(g, player, { rng, now, auto }) {
  const dice = rng.int(1, 7);
  const sixes = dice === 6 ? g.turn.sixes + 1 : 0;
  g.turn.sixes = sixes;
  const base = { type: "roll", player: player.id, color: player.color, dice, sixes, auto };

  if (dice === 6 && g.settings.maxConsecutiveSixes > 0 && sixes >= g.settings.maxConsecutiveSixes) {
    pushEvent(g, { ...base, outcome: "too-many-sixes", legal: [] }, now);
    passTurn(g, now);
    return g;
  }

  const moves = getLegalMoves(g, player.color, dice);
  if (moves.length === 0) {
    const extra = dice === 6 && g.settings.extraTurnOnSix;
    pushEvent(g, { ...base, outcome: "no-moves", legal: [], extraTurn: extra ? "six" : null }, now);
    if (extra) startTurn(g, player.color, now, { extra: true });
    else passTurn(g, now);
    return g;
  }

  g.turn.phase = "move";
  g.turn.dice = dice;
  g.turn.legal = moves.map((m) => m.token);
  g.turn.deadline = deadlineFor(g.settings, now);
  pushEvent(g, { ...base, outcome: "move", legal: [...g.turn.legal] }, now);

  if (g.settings.autoMove && hasSingleChoice(moves)) {
    return applyMove(g, player, moves[0], { now, auto: true });
  }
  return g;
}

/** Current player moves `token` by the rolled value. */
function move(game, playerId, token, { now }) {
  const g = clone(game);
  const player = requireTurn(g, playerId, "move");
  if (!Number.isInteger(token) || token < 0 || token >= TOKENS_PER_PLAYER) {
    throw new LudoError("BAD_TOKEN", "That token does not exist.");
  }
  const chosen = getLegalMoves(g, player.color, g.turn.dice).find((m) => m.token === token);
  if (!chosen) throw new LudoError("ILLEGAL_MOVE", "That token can't move with this roll.", 409);
  player.missed = 0;
  return applyMove(g, player, chosen, { now, auto: false });
}

function applyMove(g, player, m, { now, auto }) {
  const dice = g.turn.dice;
  g.tokens[player.color][m.token] = m.to;
  for (const c of m.captures) g.tokens[c.color][c.token] = BASE;

  let finishedPlayer = false;
  if (g.tokens[player.color].every((p) => p === HOME_PROGRESS)) {
    finishedPlayer = true;
    player.status = "finished";
    g.ranking.push(player.id);
    player.rank = g.ranking.length;
  }

  let extraTurn = null;
  if (!finishedPlayer) {
    if (dice === 6 && g.settings.extraTurnOnSix) extraTurn = "six";
    else if (m.captures.length && g.settings.extraTurnOnCapture) extraTurn = "capture";
    else if (m.home && g.settings.extraTurnOnHome) extraTurn = "home";
  }

  pushEvent(
    g,
    {
      type: "move",
      player: player.id,
      color: player.color,
      token: m.token,
      from: m.from,
      to: m.to,
      dice,
      captures: m.captures,
      home: m.home,
      finishedPlayer,
      extraTurn,
      auto,
    },
    now
  );

  if (checkGameOver(g, now)) return g;
  if (extraTurn) startTurn(g, player.color, now, { extra: true });
  else passTurn(g, now);
  return g;
}

/**
 * Resolves an expired turn. Anyone may ask; the engine checks the deadline
 * against the server clock. Not rolling in time skips the turn; not picking
 * a token plays the best legal move. Repeated misses remove the player.
 */
function timeout(game, { now }) {
  if (game.status !== "playing") throw new LudoError("GAME_OVER", "The game is over.", 409);
  const deadline = game.turn.deadline;
  if (deadline == null) throw new LudoError("NO_TIMER", "This game has no turn timer.", 409);
  if (now < deadline) {
    throw new LudoError("TOO_EARLY", "The turn has not timed out yet.", 409, { retryInMs: deadline - now });
  }
  let g = clone(game);
  const player = playerByColor(g, g.turn.color);
  player.missed += 1;
  const tooManyMisses = g.settings.maxMissedTurns > 0 && player.missed >= g.settings.maxMissedTurns;

  const best = g.turn.phase === "move" ? chooseBestMove(getLegalMoves(g, player.color, g.turn.dice)) : null;
  if (best) {
    g = applyMove(g, player, best, { now, auto: true });
  } else {
    pushEvent(g, { type: "skip", player: player.id, color: player.color, reason: "timeout" }, now);
    if (!tooManyMisses) passTurn(g, now);
  }

  if (tooManyMisses && g.status === "playing") {
    const p = playerById(g, player.id);
    if (p.status === "active") g = dropPlayer(g, p, "inactive", now);
  }
  return g;
}

/** A player leaves (or is removed); their tokens go off the board. */
function removePlayer(game, playerId, reason, { now }) {
  const g = clone(game);
  const player = playerById(g, playerId);
  if (!player) throw new LudoError("NOT_IN_GAME", "You are not playing in this game.", 403);
  if (player.status === "left") return g;
  if (g.status !== "playing") {
    player.status = "left";
    return g;
  }
  return dropPlayer(g, player, reason, now);
}

function dropPlayer(g, player, reason, now) {
  const wasTheirTurn = g.turn.color === player.color;
  const wasActive = player.status === "active";
  player.status = "left";
  g.tokens[player.color] = g.tokens[player.color].map((p) => (p === HOME_PROGRESS ? p : BASE));
  pushEvent(g, { type: "leave", player: player.id, color: player.color, reason }, now);
  if (!wasActive) return g;
  if (checkGameOver(g, now)) return g;
  if (wasTheirTurn) passTurn(g, now);
  return g;
}

module.exports = {
  COLORS,
  SEAT_COLORS,
  TOKENS_PER_PLAYER,
  TRACK_LENGTH,
  LAST_TRACK_PROGRESS,
  HOME_PROGRESS,
  BASE,
  START_INDEX,
  STAR_INDICES,
  DEFAULT_SETTINGS,
  TURN_SECONDS_CHOICES,
  ANIMATION_GRACE_MS,
  LudoError,
  normalizeSettings,
  trackIndex,
  isSafeIndex,
  getLegalMoves,
  chooseBestMove,
  createGame,
  roll,
  move,
  timeout,
  removePlayer,
  activeColors,
};
