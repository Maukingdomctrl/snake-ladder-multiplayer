"use strict";

const engine = require("../ludo/engine");

/** RNG that returns the given values in order (each checked against its range). */
function scriptedRng(values) {
  const queue = [...values];
  return {
    int(min, max) {
      if (queue.length === 0) throw new Error(`scriptedRng ran out of values (wanted ${min}..${max - 1})`);
      const v = queue.shift();
      if (!Number.isInteger(v) || v < min || v >= max) throw new Error(`scripted value ${v} outside ${min}..${max - 1}`);
      return v;
    },
    remaining: () => queue.length,
  };
}

/** Small seeded PRNG (mulberry32) for reproducible random simulations. */
function seededRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (min, max) => min + Math.floor(next() * (max - min)) };
}

/**
 * Builds a game with the given colours and (optionally) token positions and
 * current turn, so rules can be tested from any position.
 */
function makeGame({ colors = ["red", "yellow"], tokens = {}, turn, settings = {}, now = 0 } = {}) {
  const players = colors.map((color) => ({ id: `${color}-player`, color }));
  const firstIndex = turn ? colors.indexOf(turn) : 0;
  const game = engine.createGame({ players, settings, rng: scriptedRng([firstIndex]), now });
  for (const [color, list] of Object.entries(tokens)) game.tokens[color] = [...list];
  return game;
}

const id = (color) => `${color}-player`;

module.exports = { scriptedRng, seededRng, makeGame, id };
