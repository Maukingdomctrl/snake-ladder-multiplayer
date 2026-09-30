"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const engine = require("../ludo/engine");
const { scriptedRng, seededRng, makeGame, id } = require("./helpers");

const { BASE, HOME_PROGRESS } = engine;
const lastEvent = (game) => game.events[game.events.length - 1];
const eventsOf = (game, type) => game.events.filter((e) => e.type === type);
const noAuto = { autoMove: false };

// ── Setup ────────────────────────────────────────────────────────────────────

test("initial state: every token in base, first player drawn by the RNG", () => {
  const game = engine.createGame({
    players: [
      { id: "a", color: "red" },
      { id: "b", color: "green" },
      { id: "c", color: "yellow" },
    ],
    rng: scriptedRng([1]),
    now: 1000,
  });
  assert.equal(game.status, "playing");
  assert.deepEqual(Object.keys(game.tokens).sort(), ["green", "red", "yellow"]);
  for (const list of Object.values(game.tokens)) assert.deepEqual(list, [BASE, BASE, BASE, BASE]);
  assert.equal(game.turn.color, "green");
  assert.equal(game.turn.phase, "roll");
  assert.equal(game.turn.dice, null);
  assert.equal(game.turnNumber, 1);
  assert.equal(game.turn.deadline, 1000 + 30_000 + engine.ANIMATION_GRACE_MS);
  assert.equal(game.winnerId, null);
  assert.deepEqual(lastEvent(game), { seq: 1, at: 1000, type: "start", color: "green" });
});

test("players are ordered clockwise by colour regardless of join order", () => {
  const game = engine.createGame({
    players: [
      { id: "b", color: "blue" },
      { id: "r", color: "red" },
      { id: "y", color: "yellow" },
    ],
    rng: scriptedRng([0]),
    now: 0,
  });
  assert.deepEqual(game.players.map((p) => p.color), ["red", "yellow", "blue"]);
});

test("createGame rejects bad player lists", () => {
  const rng = scriptedRng([0, 0, 0]);
  assert.throws(() => engine.createGame({ players: [{ id: "a", color: "red" }], rng, now: 0 }), { code: "BAD_PLAYERS" });
  assert.throws(
    () => engine.createGame({ players: [{ id: "a", color: "red" }, { id: "b", color: "red" }], rng, now: 0 }),
    { code: "BAD_PLAYERS" }
  );
  assert.throws(
    () => engine.createGame({ players: [{ id: "a", color: "red" }, { id: "b", color: "pink" }], rng, now: 0 }),
    { code: "BAD_PLAYERS" }
  );
});

test("settings are validated and defaulted", () => {
  const s = engine.normalizeSettings({ maxPlayers: 3, turnSeconds: 15 });
  assert.equal(s.maxPlayers, 3);
  assert.equal(s.turnSeconds, 15);
  assert.equal(s.extraTurnOnSix, true);
  assert.throws(() => engine.normalizeSettings({ maxPlayers: 5 }), { code: "BAD_SETTINGS" });
  assert.throws(() => engine.normalizeSettings({ turnSeconds: 7 }), { code: "BAD_SETTINGS" });
  assert.throws(() => engine.normalizeSettings({ blockades: "yes" }), { code: "BAD_SETTINGS" });
  assert.throws(() => engine.normalizeSettings({ exitRolls: [7] }), { code: "BAD_SETTINGS" });
});

// ── Geometry ─────────────────────────────────────────────────────────────────

test("track index wraps around the 52-square loop from each start square", () => {
  assert.equal(engine.trackIndex("red", 0), 0);
  assert.equal(engine.trackIndex("green", 0), 13);
  assert.equal(engine.trackIndex("yellow", 30), 4);
  assert.equal(engine.trackIndex("blue", 50), 37);
  assert.equal(engine.trackIndex("red", 51), null, "home column is not on the shared track");
  assert.equal(engine.trackIndex("red", BASE), null);
});

// ── Dice and turns ───────────────────────────────────────────────────────────

test("dice values are always 1..6 with a crypto RNG", () => {
  const rng = { int: (a, b) => crypto.randomInt(a, b) };
  const seen = new Set();
  let game = makeGame({ settings: { ...noAuto, maxConsecutiveSixes: 0 } });
  for (let i = 0; i < 600; i++) {
    const current = game.turn.color;
    game = engine.roll(game, id(current), { rng, now: 0 });
    const roll = eventsOf(game, "roll").pop();
    assert.ok(roll.dice >= 1 && roll.dice <= 6);
    seen.add(roll.dice);
    // reset to a clean roll phase for the next sample
    game = makeGame({ settings: { ...noAuto, maxConsecutiveSixes: 0 } });
  }
  assert.equal(seen.size, 6);
});

test("turn order follows clockwise colours and wraps", () => {
  let game = makeGame({ colors: ["red", "green", "yellow", "blue"], turn: "yellow" });
  const order = [];
  for (let i = 0; i < 5; i++) {
    order.push(game.turn.color);
    game = engine.roll(game, id(game.turn.color), { rng: scriptedRng([2]), now: 0 }); // no token can move
  }
  assert.deepEqual(order, ["yellow", "blue", "red", "green", "yellow"]);
  assert.equal(game.turnNumber, 6);
});

test("rolling without a 6 while every token is in base passes the turn", () => {
  let game = makeGame({ turn: "red" });
  game = engine.roll(game, id("red"), { rng: scriptedRng([4]), now: 0 });
  assert.equal(lastEvent(game).outcome, "no-moves");
  assert.equal(game.turn.color, "yellow");
  assert.equal(game.turn.phase, "roll");
});

test("rolling a 6 brings a token onto the start square and grants another roll", () => {
  let game = makeGame({ turn: "red", settings: noAuto });
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 });
  assert.equal(game.turn.phase, "move");
  assert.deepEqual(game.turn.legal, [0, 1, 2, 3]);
  game = engine.move(game, id("red"), 2, { now: 0 });
  assert.deepEqual(game.tokens.red, [BASE, BASE, 0, BASE]);
  const mv = lastEvent(game);
  assert.equal(mv.type, "move");
  assert.equal(mv.from, BASE);
  assert.equal(mv.to, 0);
  assert.equal(mv.extraTurn, "six");
  assert.equal(game.turn.color, "red");
  assert.equal(game.turn.phase, "roll");
});

test("auto-move plays the move when every choice is equivalent", () => {
  let game = makeGame({ turn: "red" });
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 });
  assert.deepEqual(game.tokens.red, [0, BASE, BASE, BASE]);
  const [roll, mv] = game.events.slice(-2);
  assert.equal(roll.type, "roll");
  assert.equal(mv.type, "move");
  assert.equal(mv.auto, true);
});

test("auto-move waits for a choice when tokens are on different squares", () => {
  let game = makeGame({ turn: "red", tokens: { red: [3, 10, BASE, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([2]), now: 0 });
  assert.equal(game.turn.phase, "move");
  assert.deepEqual(game.turn.legal, [0, 1]);
});

test("normal movement moves the exact dice distance", () => {
  let game = makeGame({ turn: "red", tokens: { red: [5, 20, BASE, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([3]), now: 0 });
  game = engine.move(game, id("red"), 1, { now: 0 });
  assert.deepEqual(game.tokens.red, [5, 23, BASE, BASE]);
  assert.equal(game.turn.color, "yellow");
});

test("tokens enter their own coloured home column after the main track", () => {
  let game = makeGame({ turn: "green", colors: ["red", "green"], tokens: { green: [48, BASE, BASE, BASE] } });
  game = engine.roll(game, id("green"), { rng: scriptedRng([5]), now: 0 });
  const mv = lastEvent(game);
  assert.equal(mv.to, 53);
  assert.equal(engine.trackIndex("green", 53), null);
});

test("finishing needs the exact number; overshooting is not a legal move", () => {
  const game = makeGame({ turn: "red", tokens: { red: [53, BASE, BASE, BASE] } });
  assert.deepEqual(engine.getLegalMoves(game, "red", 4), []);
  assert.equal(engine.getLegalMoves(game, "red", 3)[0].home, true);
  const g2 = engine.roll(game, id("red"), { rng: scriptedRng([5]), now: 0 });
  assert.equal(lastEvent(g2).outcome, "no-moves");
  assert.deepEqual(g2.tokens.red, [53, BASE, BASE, BASE]);
});

test("reaching home grants an extra turn", () => {
  let game = makeGame({ turn: "red", tokens: { red: [53, 10, BASE, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([3]), now: 0 });
  game = engine.move(game, id("red"), 0, { now: 0 });
  assert.equal(game.tokens.red[0], HOME_PROGRESS);
  assert.equal(lastEvent(game).home, true);
  assert.equal(lastEvent(game).extraTurn, "home");
  assert.equal(game.turn.color, "red");
});

// ── Captures and safe squares ────────────────────────────────────────────────

test("landing on an opponent sends it home and grants an extra turn", () => {
  // red progress 5 = square 5; yellow progress 35 = square (26+35)%52 = 9
  let game = makeGame({ turn: "red", tokens: { red: [5, BASE, BASE, BASE], yellow: [35, BASE, BASE, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([4]), now: 0 });
  assert.deepEqual(game.tokens.red, [9, BASE, BASE, BASE]);
  assert.deepEqual(game.tokens.yellow, [BASE, BASE, BASE, BASE]);
  const mv = lastEvent(game);
  assert.deepEqual(mv.captures, [{ color: "yellow", token: 0, from: 35 }]);
  assert.equal(mv.extraTurn, "capture");
  assert.equal(game.turn.color, "red");
});

test("tokens on star squares and start squares are safe", () => {
  // yellow progress 34 = square 8 (star)
  let game = makeGame({ turn: "red", tokens: { red: [4, BASE, BASE, BASE], yellow: [34, BASE, BASE, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([4]), now: 0 });
  assert.equal(game.tokens.red[0], 8);
  assert.equal(game.tokens.yellow[0], 34, "not captured on a star square");
  assert.equal(lastEvent(game).captures.length, 0);

  // yellow progress 26 = square 0 (red's start square): red coming out doesn't capture it
  let g2 = makeGame({ turn: "red", tokens: { yellow: [26, BASE, BASE, BASE] } });
  g2 = engine.roll(g2, id("red"), { rng: scriptedRng([6]), now: 0 });
  assert.equal(g2.tokens.red[0], 0);
  assert.equal(g2.tokens.yellow[0], 26);
});

test("with safe squares turned off, star squares can be captured on", () => {
  let game = makeGame({
    turn: "red",
    settings: { safeSquares: false },
    tokens: { red: [4, BASE, BASE, BASE], yellow: [34, BASE, BASE, BASE] },
  });
  game = engine.roll(game, id("red"), { rng: scriptedRng([4]), now: 0 });
  assert.equal(game.tokens.yellow[0], BASE);
});

test("tokens in a home column can never be captured", () => {
  const game = makeGame({ turn: "red", tokens: { red: [50, BASE, BASE, BASE], yellow: [52, BASE, BASE, BASE] } });
  for (const m of engine.getLegalMoves(game, "red", 2)) assert.deepEqual(m.captures, []);
});

test("several tokens of one colour may share a square", () => {
  let game = makeGame({ turn: "red", tokens: { red: [5, 5, 2, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([3]), now: 0 });
  game = engine.move(game, id("red"), 2, { now: 0 });
  assert.deepEqual(game.tokens.red, [5, 5, 5, BASE]);
});

test("without blockades, landing on a pair captures both tokens", () => {
  let game = makeGame({ turn: "red", tokens: { red: [5, BASE, BASE, BASE], yellow: [35, 35, BASE, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([4]), now: 0 });
  assert.deepEqual(game.tokens.yellow, [BASE, BASE, BASE, BASE]);
  assert.equal(lastEvent(game).captures.length, 2);
});

test("with blockades on, a pair can't be landed on or passed", () => {
  const game = makeGame({
    turn: "red",
    settings: { blockades: true },
    tokens: { red: [5, BASE, BASE, BASE], yellow: [35, 35, BASE, BASE] }, // pair on square 9
  });
  assert.deepEqual(engine.getLegalMoves(game, "red", 4), [], "can't land on the blockade");
  assert.ok(!engine.getLegalMoves(game, "red", 6).some((m) => m.token === 0), "can't pass through it");
  assert.equal(engine.getLegalMoves(game, "red", 3).length, 1, "can stop short of it");
});

// ── Invalid actions ──────────────────────────────────────────────────────────

test("wrong player, wrong phase, bad and illegal tokens are rejected", () => {
  const game = makeGame({ turn: "red", tokens: { red: [5, BASE, BASE, BASE] }, settings: noAuto });
  const rng = () => scriptedRng([3]);
  assert.throws(() => engine.roll(game, id("yellow"), { rng: rng(), now: 0 }), { code: "NOT_YOUR_TURN" });
  assert.throws(() => engine.roll(game, "stranger", { rng: rng(), now: 0 }), { code: "NOT_IN_GAME" });
  assert.throws(() => engine.move(game, id("red"), 0, { now: 0 }), { code: "WRONG_PHASE" }, "move before rolling");

  const rolled = engine.roll(game, id("red"), { rng: rng(), now: 0 });
  assert.throws(() => engine.roll(rolled, id("red"), { rng: rng(), now: 0 }), { code: "WRONG_PHASE" }, "rolling twice");
  assert.throws(() => engine.move(rolled, id("red"), 1, { now: 0 }), { code: "ILLEGAL_MOVE" }, "token in base with a 3");
  assert.throws(() => engine.move(rolled, id("red"), 7, { now: 0 }), { code: "BAD_TOKEN" });
  assert.throws(() => engine.move(rolled, id("red"), "0", { now: 0 }), { code: "BAD_TOKEN" });
  assert.throws(() => engine.move(rolled, id("yellow"), 0, { now: 0 }), { code: "NOT_YOUR_TURN" });
});

test("engine functions never mutate their input", () => {
  const game = makeGame({ turn: "red", tokens: { red: [5, BASE, BASE, BASE], yellow: [35, BASE, BASE, BASE] } });
  const snapshot = structuredClone(game);
  engine.roll(game, id("red"), { rng: scriptedRng([4]), now: 0 });
  assert.deepEqual(game, snapshot);
});

// ── Extra turns ──────────────────────────────────────────────────────────────

test("extra-turn rules can be switched off", () => {
  let game = makeGame({
    turn: "red",
    settings: { extraTurnOnSix: false, extraTurnOnCapture: false },
    tokens: { red: [3, HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS], yellow: [35, BASE, BASE, BASE] },
  });
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 }); // 3 -> 9 captures, rolled a 6
  assert.equal(lastEvent(game).captures.length, 1);
  assert.equal(lastEvent(game).extraTurn, null);
  assert.equal(game.turn.color, "yellow");
});

test("a six plus a capture still gives only one extra roll", () => {
  let game = makeGame({ turn: "red", tokens: { red: [3, BASE, BASE, BASE], yellow: [35, BASE, BASE, BASE] }, settings: noAuto });
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 });
  game = engine.move(game, id("red"), 0, { now: 0 });
  assert.equal(game.turn.color, "red");
  game = engine.roll(game, id("red"), { rng: scriptedRng([2]), now: 0 });
  game = engine.move(game, id("red"), 0, { now: 0 });
  assert.equal(game.turn.color, "yellow");
});

test("the third six in a row forfeits the turn", () => {
  let game = makeGame({ turn: "red", tokens: { red: [10, BASE, BASE, BASE] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 });
  game = engine.move(game, id("red"), 0, { now: 0 });
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 });
  game = engine.move(game, id("red"), 0, { now: 0 });
  const before = structuredClone(game.tokens);
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 });
  assert.equal(lastEvent(game).outcome, "too-many-sixes");
  assert.deepEqual(game.tokens, before);
  assert.equal(game.turn.color, "yellow");
  assert.equal(game.turn.sixes, 0);
});

test("a six with no legal move still earns the extra roll", () => {
  let game = makeGame({ turn: "red", tokens: { red: [52, HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS] } });
  game = engine.roll(game, id("red"), { rng: scriptedRng([6]), now: 0 });
  assert.equal(lastEvent(game).outcome, "no-moves");
  assert.equal(lastEvent(game).extraTurn, "six");
  assert.equal(game.turn.color, "red");
});

// ── Winning ──────────────────────────────────────────────────────────────────

test("the first player with all four tokens home wins", () => {
  let game = makeGame({
    colors: ["red", "green", "yellow"],
    turn: "red",
    tokens: { red: [55, HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS], green: [30, 4, BASE, BASE] },
  });
  game = engine.roll(game, id("red"), { rng: scriptedRng([1]), now: 0 });
  assert.equal(game.status, "finished");
  assert.equal(game.winnerId, id("red"));
  assert.deepEqual(game.ranking, [id("red"), id("green"), id("yellow")]);
  assert.equal(lastEvent(game).type, "end");
  assert.equal(game.turn.phase, "over");
  assert.throws(() => engine.roll(game, id("green"), { rng: scriptedRng([1]), now: 0 }), { code: "GAME_OVER" });
});

test('with endCondition "all" the game continues for the remaining places', () => {
  let game = makeGame({
    colors: ["red", "green", "yellow"],
    turn: "red",
    settings: { endCondition: "all" },
    tokens: {
      red: [55, HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS],
      green: [55, HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS],
    },
  });
  game = engine.roll(game, id("red"), { rng: scriptedRng([1]), now: 0 });
  assert.equal(game.status, "playing");
  assert.equal(game.turn.color, "green", "finished players are skipped, no extra turn");
  game = engine.roll(game, id("green"), { rng: scriptedRng([1]), now: 0 });
  assert.equal(game.status, "finished");
  assert.deepEqual(game.ranking, [id("red"), id("green"), id("yellow")]);
  assert.equal(game.winnerId, id("red"));
});

// ── Timeouts, leaving ────────────────────────────────────────────────────────

test("a timeout before the deadline is rejected", () => {
  const game = makeGame({ now: 1000 });
  assert.throws(() => engine.timeout(game, { now: 1000 }), (e) => e.code === "TOO_EARLY" && e.extra.retryInMs > 0);
});

test("missing the roll skips the turn; missing the move plays the best one", () => {
  let game = makeGame({ turn: "red", tokens: { red: [3, 40, BASE, BASE], yellow: [36, BASE, BASE, BASE] }, settings: noAuto });
  const late = game.turn.deadline;
  game = engine.timeout(game, { now: late });
  assert.equal(lastEvent(game).type, "skip");
  assert.equal(game.players[0].missed, 1);
  assert.equal(game.turn.color, "yellow");

  game = engine.roll(game, id("yellow"), { rng: scriptedRng([1]), now: late }); // yellow 36 -> 37
  game = engine.move(game, id("yellow"), 0, { now: late });
  game = engine.roll(game, id("red"), { rng: scriptedRng([4]), now: late }); // 3->7 or 40->44 (captures yellow at 37+26-52=11? no)
  game = engine.timeout(game, { now: game.turn.deadline });
  const mv = lastEvent(game);
  assert.equal(mv.type, "move");
  assert.equal(mv.auto, true);
  assert.equal(mv.token, 1, "prefers the most advanced token when nothing better");
  assert.equal(game.players[0].missed, 1, "rolling reset the counter, the missed move counts again");
});

test("acting resets the missed-turn counter", () => {
  let game = makeGame({ turn: "red" });
  game = engine.timeout(game, { now: game.turn.deadline }); // red misses
  game = engine.roll(game, id("yellow"), { rng: scriptedRng([2]), now: 0 });
  game = engine.roll(game, id("red"), { rng: scriptedRng([2]), now: 0 });
  assert.equal(game.players.find((p) => p.color === "red").missed, 0);
});

test("too many missed turns removes the player; the last one standing wins", () => {
  let game = makeGame({ turn: "red", settings: { maxMissedTurns: 2 } });
  game = engine.timeout(game, { now: game.turn.deadline }); // red misses #1
  game = engine.roll(game, id("yellow"), { rng: scriptedRng([2]), now: 0 });
  game = engine.timeout(game, { now: game.turn.deadline }); // red misses #2 -> removed
  const red = game.players.find((p) => p.color === "red");
  assert.equal(red.status, "left");
  assert.equal(lastEvent(game).type, "end");
  assert.equal(game.status, "finished");
  assert.equal(game.winnerId, id("yellow"));
  assert.ok(eventsOf(game, "leave").some((e) => e.reason === "inactive"));
});

test("leaving mid-game clears that player's tokens and passes their turn", () => {
  let game = makeGame({
    colors: ["red", "green", "yellow"],
    turn: "green",
    tokens: { green: [10, 55, HOME_PROGRESS, BASE] },
  });
  game = engine.removePlayer(game, id("green"), "left", { now: 0 });
  assert.equal(game.status, "playing");
  assert.equal(game.turn.color, "yellow");
  assert.deepEqual(game.tokens.green, [BASE, BASE, HOME_PROGRESS, BASE]);
  // Left players are skipped in the rotation
  game = engine.roll(game, id("yellow"), { rng: scriptedRng([2]), now: 0 });
  assert.equal(game.turn.color, "red");
  game = engine.roll(game, id("red"), { rng: scriptedRng([2]), now: 0 });
  assert.equal(game.turn.color, "yellow");
  assert.throws(() => engine.roll(game, id("green"), { rng: scriptedRng([2]), now: 0 }), { code: "LEFT_GAME" });
});

test("a game with no timer can't be timed out", () => {
  const game = makeGame({ settings: { turnSeconds: 0 } });
  assert.equal(game.turn.deadline, null);
  assert.throws(() => engine.timeout(game, { now: 1e12 }), { code: "NO_TIMER" });
});

// ── Whole games ──────────────────────────────────────────────────────────────

function checkInvariants(game) {
  for (const [color, list] of Object.entries(game.tokens)) {
    assert.equal(list.length, 4);
    for (const p of list) assert.ok(p === BASE || (p >= 0 && p <= HOME_PROGRESS), `${color} token at ${p}`);
  }
  // Two colours can only share a main-track square if it is a safe square.
  const occupied = new Map();
  for (const [color, list] of Object.entries(game.tokens)) {
    for (const p of list) {
      const sq = engine.trackIndex(color, p);
      if (sq === null) continue;
      if (!occupied.has(sq)) occupied.set(sq, new Set());
      occupied.get(sq).add(color);
    }
  }
  for (const [sq, colors] of occupied) {
    if (colors.size > 1) assert.ok(engine.isSafeIndex(sq, game.settings), `colours ${[...colors]} share unsafe square ${sq}`);
  }
}

for (const count of [2, 3, 4]) {
  test(`random ${count}-player games always finish with exactly one winner`, () => {
    const colors = engine.SEAT_COLORS[count];
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seededRng(seed * 7919 + count);
      let game = engine.createGame({ players: colors.map((c) => ({ id: c, color: c })), settings: noAuto, rng, now: 0 });
      let actions = 0;
      while (game.status === "playing") {
        assert.ok(++actions < 5000, `game ${seed} did not finish`);
        const color = game.turn.color;
        if (game.turn.phase === "roll") game = engine.roll(game, color, { rng, now: 0 });
        else game = engine.move(game, color, game.turn.legal[rng.int(0, game.turn.legal.length)], { now: 0 });
        checkInvariants(game);
      }
      assert.ok(game.winnerId);
      assert.ok(game.tokens[game.winnerId].every((p) => p === HOME_PROGRESS));
      assert.equal(game.ranking.length, count);
    }
  });
}

test("random games with blockades and auto-move also terminate", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rng = seededRng(seed);
    let game = engine.createGame({
      players: engine.COLORS.map((c) => ({ id: c, color: c })),
      settings: { blockades: true },
      rng,
      now: 0,
    });
    let actions = 0;
    while (game.status === "playing") {
      assert.ok(++actions < 8000, `game ${seed} did not finish`);
      const color = game.turn.color;
      if (game.turn.phase === "roll") game = engine.roll(game, color, { rng, now: 0 });
      else game = engine.move(game, color, game.turn.legal[0], { now: 0 });
    }
    assert.ok(game.winnerId);
  }
});

test("event sequence numbers strictly increase and the log stays bounded", () => {
  const rng = seededRng(42);
  let game = engine.createGame({ players: [{ id: "red", color: "red" }, { id: "yellow", color: "yellow" }], rng, now: 0 });
  let lastSeq = 0;
  for (let i = 0; i < 300 && game.status === "playing"; i++) {
    const color = game.turn.color;
    game = game.turn.phase === "roll" ? engine.roll(game, color, { rng, now: 0 }) : engine.move(game, color, game.turn.legal[0], { now: 0 });
    const seqs = game.events.map((e) => e.seq);
    assert.ok(seqs.every((s, j) => j === 0 || s === seqs[j - 1] + 1));
    assert.ok(seqs[seqs.length - 1] >= lastSeq);
    lastSeq = seqs[seqs.length - 1];
    assert.ok(game.events.length <= 24);
  }
});
