/// <reference types="node" />
// Test helpers: rooms built from the real server engine, so UI tests render
// exactly the states the server produces.
import { createRequire } from "node:module";
import type { LudoColor, LudoGame, LudoRoom, LudoSettings } from "../types";

type Rng = { int(min: number, max: number): number };
type Engine = {
  COLORS: LudoColor[];
  TRACK_LENGTH: number;
  LAST_TRACK_PROGRESS: number;
  HOME_PROGRESS: number;
  BASE: number;
  START_INDEX: Record<LudoColor, number>;
  STAR_INDICES: number[];
  trackIndex(color: LudoColor, progress: number): number | null;
  createGame(options: { players: { id: string; color: LudoColor }[]; settings?: Partial<LudoSettings>; rng: Rng; now: number }): LudoGame;
  roll(game: LudoGame, playerId: string, options: { rng: Rng; now: number }): LudoGame;
  move(game: LudoGame, playerId: string, token: number, options: { now: number }): LudoGame;
  removePlayer(game: LudoGame, playerId: string, reason: string, options: { now: number }): LudoGame;
};

const require = createRequire(import.meta.url);
export const engine = require("../../../../../server/ludo/engine.js") as Engine;

export const idOf = (color: LudoColor) => `${color}-id`;
export const NAMES: Record<LudoColor, string> = { red: "Alice", green: "Gina", yellow: "Bob", blue: "Bea" };

/** RNG returning the given values in order. */
export function rngOf(...values: number[]): Rng {
  const queue = [...values];
  return {
    int() {
      if (!queue.length) throw new Error("rng ran out of values");
      return queue.shift()!;
    },
  };
}

type Options = {
  colors?: LudoColor[];
  first?: LudoColor;
  tokens?: Partial<Record<LudoColor, number[]>>;
  settings?: Partial<LudoSettings>;
  hostColor?: LudoColor;
};

/** A room with a game in progress. */
export function makeRoom({ colors = ["red", "yellow"], first = colors[0], tokens = {}, settings = {}, hostColor }: Options = {}): LudoRoom {
  const players = colors.map((color) => ({ id: idOf(color), color }));
  const game = engine.createGame({ players, settings, rng: rngOf(colors.indexOf(first)), now: Date.now() });
  for (const [color, list] of Object.entries(tokens)) game.tokens[color as LudoColor] = [...list];
  return roomWith(game, { hostColor: hostColor ?? colors[0] });
}

/** Wraps a game in a room document (the shape the client subscribes to). */
export function roomWith(game: LudoGame, { hostColor = game.players[0].color, version = 10 } = {}): LudoRoom {
  const members = game.players.filter((p) => p.status !== "left");
  return {
    id: "1234",
    game: "ludo",
    hostId: idOf(hostColor),
    players: members.map((p) => p.id),
    playerNames: Object.fromEntries(game.players.map((p) => [p.id, NAMES[p.color]])),
    playerColors: Object.fromEntries(game.players.map((p) => [p.id, "#000"])),
    status: game.status,
    version,
    ludo: {
      settings: game.settings,
      seats: members.map((p) => ({ id: p.id, color: p.color, ready: true })),
      game,
      recentActions: [],
    },
  };
}

/** A lobby (no game yet). */
export function makeLobby(seats: { color: LudoColor; ready: boolean }[], maxPlayers: 2 | 3 | 4 = 4): LudoRoom {
  const room = makeRoom({ colors: ["red", "yellow"] });
  room.status = "waiting";
  room.ludo.game = null;
  room.ludo.settings = { ...room.ludo.settings, maxPlayers };
  room.ludo.seats = seats.map((s) => ({ id: idOf(s.color), ...s }));
  room.players = room.ludo.seats.map((s) => s.id);
  room.playerNames = Object.fromEntries(seats.map((s) => [idOf(s.color), NAMES[s.color]]));
  room.hostId = room.ludo.seats[0].id;
  return room;
}
