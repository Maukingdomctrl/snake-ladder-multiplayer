"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createLudoService } = require("../ludo/service");
const { createLudoRouter } = require("../ludo/router");
const { HOME_PROGRESS, BASE } = require("../ludo/engine");
const { createMemoryStore } = require("./memoryStore");
const { seededRng } = require("./helpers");

/** RNG with a queue of forced values, falling back to a seeded sequence. */
function controllableRng(seed = 1) {
  const fallback = seededRng(seed);
  const queue = [];
  return {
    push: (...values) => queue.push(...values),
    int(min, max) {
      if (queue.length) {
        const v = queue.shift();
        assert.ok(v >= min && v < max, `forced value ${v} outside ${min}..${max - 1}`);
        return v;
      }
      return fallback.int(min, max);
    },
  };
}

function harness({ seed = 1 } = {}) {
  const store = createMemoryStore();
  const clock = { t: 1_000_000 };
  const rng = controllableRng(seed);
  const service = createLudoService({ store, rng, now: () => clock.t });
  let counter = 0;
  const nextId = (uid) => `action-${uid}-${++counter}`;

  const h = {
    store,
    clock,
    rng,
    service,
    room: (roomId) => structuredClone(store.docs.get(roomId)),
    async create(uid, body = {}) {
      return service.create(uid, { name: uid, ...body });
    },
    act(uid, roomId, type, payload = {}, { actionId = nextId(uid), version } = {}) {
      return service.act(uid, { roomId, action: { type, actionId, expectedVersion: version, ...payload } });
    },
    /** Game actions carry the version the player saw. */
    play(uid, roomId, type, payload = {}, opts = {}) {
      return h.act(uid, roomId, type, payload, { version: h.room(roomId).version, ...opts });
    },
    /** Creates a room with `names` seated (first is host), everyone ready. */
    async lobby(names, { start = false } = {}) {
      const [host, ...others] = names;
      const { roomId } = await h.create(host, { maxPlayers: names.length });
      for (const uid of others) {
        await h.act(uid, roomId, "join", { name: uid });
        await h.act(uid, roomId, "ready", { ready: true });
      }
      if (start) await h.act(host, roomId, "start");
      return roomId;
    },
  };
  return h;
}

const currentPlayer = (room) => room.ludo.game.players.find((p) => p.color === room.ludo.game.turn.color).id;
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code || assert.fail(`expected ${code}, got ${e.code}: ${e.message}`));

// ── Lobby ────────────────────────────────────────────────────────────────────

test("creating a room seats the host as red with a 4-digit code", async () => {
  const h = harness();
  const { roomId, room } = await h.create("alice", { maxPlayers: 3 });
  assert.match(roomId, /^\d{4}$/);
  assert.equal(room.game, "ludo");
  assert.equal(room.status, "waiting");
  assert.equal(room.hostId, "alice");
  assert.deepEqual(room.players, ["alice"]);
  assert.deepEqual(room.ludo.seats, [{ id: "alice", color: "red", ready: true }]);
  assert.equal(room.ludo.settings.maxPlayers, 3);
  await rejects(h.create("bob", { maxPlayers: 5 }), "BAD_SETTINGS");
});

test("colours are assigned automatically without duplicates (2, 3 and 4 players)", async () => {
  const expected = { 2: ["red", "yellow"], 3: ["red", "green", "yellow"], 4: ["red", "green", "yellow", "blue"] };
  for (const count of [2, 3, 4]) {
    const h = harness();
    const names = ["p1", "p2", "p3", "p4"].slice(0, count);
    const roomId = await h.lobby(names);
    assert.deepEqual(h.room(roomId).ludo.seats.map((s) => s.color), expected[count]);
  }
});

test("joining: unknown room, full room, other game, rejoin", async () => {
  const h = harness();
  await rejects(h.act("bob", "1234", "join", { name: "Bob" }), "ROOM_NOT_FOUND");
  await rejects(h.act("bob", "12a4", "join", { name: "Bob" }), "BAD_REQUEST");

  h.store.docs.set("5555", { hostId: "x", players: ["x"], status: "waiting", positions: { x: 1 } });
  await rejects(h.act("bob", "5555", "join", { name: "Bob" }), "NOT_LUDO");

  const roomId = await h.lobby(["alice", "bob"]);
  await rejects(h.act("carol", roomId, "join", { name: "Carol" }), "ROOM_FULL");

  const before = h.room(roomId).version;
  const again = await h.act("bob", roomId, "join", { name: "bob" });
  assert.equal(again.room.version, before, "rejoining with the same name changes nothing");
  assert.equal(h.room(roomId).ludo.seats.length, 2);
});

test("lobby rules: ready, colour picking, player count and who may start", async () => {
  const h = harness();
  const { roomId } = await h.create("alice", { maxPlayers: 3 });
  await h.act("bob", roomId, "join", { name: "Bob" });
  await rejects(h.act("alice", roomId, "start"), "NOT_ENOUGH_PLAYERS");

  await rejects(h.act("bob", roomId, "color", { color: "red" }), "COLOR_TAKEN");
  await h.act("bob", roomId, "color", { color: "blue" });
  assert.equal(h.room(roomId).ludo.seats[1].color, "blue");
  assert.equal(h.room(roomId).playerColors.bob, "#2a64c8");
  await rejects(h.act("bob", roomId, "color", { color: "purple" }), "BAD_REQUEST");

  await rejects(h.act("bob", roomId, "settings", { maxPlayers: 2 }), "NOT_HOST");
  await h.act("alice", roomId, "settings", { maxPlayers: 2 });
  await rejects(h.act("alice", roomId, "start"), "NOT_READY");
  await h.act("bob", roomId, "ready", { ready: true });
  await rejects(h.act("bob", roomId, "start"), "NOT_HOST");
  await h.act("alice", roomId, "start");
  const room = h.room(roomId);
  assert.equal(room.status, "playing");
  assert.deepEqual(room.ludo.game.players.map((p) => p.color), ["red", "blue"]);

  await rejects(h.act("carol", roomId, "join", { name: "Carol" }), "GAME_STARTED");
  await rejects(h.act("alice", roomId, "settings", { maxPlayers: 4 }), "GAME_STARTED");
});

test("the host can't shrink the table below the players already seated", async () => {
  const h = harness();
  const roomId = await h.lobby(["a", "b", "c"]);
  await rejects(h.act("a", roomId, "settings", { maxPlayers: 2 }), "TOO_MANY_PLAYERS");
});

test("leaving the lobby hands over host; the last one out deletes the room", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob", "carol"]);
  await h.act("alice", roomId, "leave");
  let room = h.room(roomId);
  assert.equal(room.hostId, "bob");
  assert.deepEqual(room.players, ["bob", "carol"]);
  assert.equal(room.ludo.seats[0].ready, true, "the new host counts as ready");
  assert.equal(room.playerNames.alice, undefined);

  await h.act("bob", roomId, "leave");
  await h.act("carol", roomId, "leave");
  assert.equal(h.store.docs.has(roomId), false);
});

// ── Authority and validation ─────────────────────────────────────────────────

test("dice come from the server: client-sent values and player ids are ignored", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob"], { start: true });
  const current = currentPlayer(h.room(roomId));
  const other = current === "alice" ? "bob" : "alice";

  h.rng.push(2);
  const { room } = await h.play(current, roomId, "roll", { dice: 6, value: 6 });
  const roll = room.ludo.game.events.find((e) => e.type === "roll");
  assert.equal(roll.dice, 2);

  // Claiming to act for someone else does nothing: the auth uid decides.
  await rejects(h.play(current, roomId, "roll", { playerId: other }), "NOT_YOUR_TURN");
});

test("moving before rolling, rolling twice and illegal tokens are rejected", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob"], { start: true });
  const p = currentPlayer(h.room(roomId));
  await rejects(h.play(p, roomId, "move", { token: 0 }), "WRONG_PHASE");

  // Put two of the current player's tokens out on different squares.
  const stored = h.store.docs.get(roomId);
  stored.ludo.game.tokens[stored.ludo.game.turn.color] = [5, 10, BASE, BASE];
  h.rng.push(3);
  await h.play(p, roomId, "roll");
  assert.equal(h.room(roomId).ludo.game.turn.phase, "move");
  assert.deepEqual(h.room(roomId).ludo.game.turn.legal, [0, 1]);

  await rejects(h.play(p, roomId, "roll"), "WRONG_PHASE");
  await rejects(h.play(p, roomId, "move", { token: 3 }), "ILLEGAL_MOVE");
  await rejects(h.play(p, roomId, "move", { token: 99 }), "BAD_TOKEN");
  await rejects(h.play(p, roomId, "move", { token: "1" }), "BAD_TOKEN");
  const other = p === "alice" ? "bob" : "alice";
  await rejects(h.play(other, roomId, "move", { token: 0 }), "NOT_YOUR_TURN");
  await h.play(p, roomId, "move", { token: 1 });
  assert.deepEqual(h.room(roomId).ludo.game.tokens[stored.ludo.game.turn.color], [5, 13, BASE, BASE]);
});

test("game actions must carry the current version; stale ones are rejected", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob"], { start: true });
  const p = currentPlayer(h.room(roomId));
  await rejects(h.act(p, roomId, "roll"), "BAD_REQUEST");

  const seen = h.room(roomId).version;
  h.rng.push(1); // no move possible -> turn passes
  await h.act(p, roomId, "roll", {}, { version: seen });
  const q = currentPlayer(h.room(roomId));
  // A delayed request from before that roll arrives late (out of order).
  await assert.rejects(h.act(q, roomId, "roll", {}, { version: seen }), (e) => {
    assert.equal(e.code, "STALE");
    assert.equal(e.extra.version, seen + 1);
    return true;
  });
});

test("a retried action with the same id is applied only once", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob"], { start: true });
  const p = currentPlayer(h.room(roomId));
  const version = h.room(roomId).version;

  h.rng.push(4);
  const first = await h.act(p, roomId, "roll", {}, { actionId: "retry-me-123", version });
  const writes = h.store.writeCount();
  const second = await h.act(p, roomId, "roll", {}, { actionId: "retry-me-123", version });
  assert.equal(second.duplicate, true);
  assert.equal(second.room.version, first.room.version);
  assert.equal(h.store.writeCount(), writes, "nothing written for the duplicate");
  assert.equal(h.room(roomId).ludo.game.events.filter((e) => e.type === "roll").length, 1);
});

test("simultaneous requests: only the player whose turn it is gets through, once", async () => {
  const h = harness({ seed: 9 });
  const names = ["a", "b", "c", "d"];
  const roomId = await h.lobby(names, { start: true });
  const version = h.room(roomId).version;
  const current = currentPlayer(h.room(roomId));

  const results = await Promise.allSettled([
    ...names.map((uid) => h.act(uid, roomId, "roll", {}, { version })),
    h.act(current, roomId, "roll", {}, { version }), // double tap with a new action id
  ]);
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1);
  const codes = results.filter((r) => r.status === "rejected").map((r) => r.reason.code).sort();
  assert.ok(codes.every((c) => c === "NOT_YOUR_TURN" || c === "STALE" || c === "WRONG_PHASE"), codes.join());
  assert.equal(h.room(roomId).ludo.game.events.filter((e) => e.type === "roll").length, 1);
  assert.equal(h.room(roomId).version, version + 1);
});

test("reconnecting: rejoining mid-game returns the live state without changing it", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob"], { start: true });
  h.rng.push(6);
  await h.play(currentPlayer(h.room(roomId)), roomId, "roll");
  const before = h.room(roomId);

  // bob refreshes the page: the client simply re-joins by room code
  const { room } = await h.act("bob", roomId, "join", { name: "bob" });
  assert.deepEqual(room, before);
  // …and can keep playing from the authoritative state
  const p = currentPlayer(room);
  h.rng.push(2);
  await h.play(p, roomId, "roll");
  assert.ok(h.room(roomId).version > before.version);
});

test("leaving mid-game forfeits; the last player standing wins; they can't rejoin", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob"], { start: true });
  await h.act("bob", roomId, "leave");
  const room = h.room(roomId);
  assert.equal(room.status, "finished");
  assert.equal(room.ludo.game.winnerId, "alice");
  assert.deepEqual(room.players, ["alice"]);
  assert.equal(room.playerNames.bob, "bob", "kept for the results screen");
  await rejects(h.act("bob", roomId, "join", { name: "bob" }), "LEFT_GAME");
});

test("a player leaving a 3-player game doesn't stop the others", async () => {
  const h = harness();
  const roomId = await h.lobby(["a", "b", "c"], { start: true });
  const leaver = currentPlayer(h.room(roomId));
  await h.act(leaver, roomId, "leave");
  const room = h.room(roomId);
  assert.equal(room.status, "playing");
  assert.notEqual(currentPlayer(room), leaver);
  assert.equal(room.players.length, 2);
});

test("turn timer: too early is refused, then the turn is skipped; strangers can't poke", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob"], { start: true });
  const room = h.room(roomId);
  const p = currentPlayer(room);
  const watcher = p === "alice" ? "bob" : "alice";

  await assert.rejects(h.play(watcher, roomId, "timeout"), (e) => e.code === "TOO_EARLY" && e.extra.retryInMs > 0);
  h.clock.t = room.ludo.game.turn.deadline;
  await rejects(h.play("stranger", roomId, "timeout"), "NOT_IN_ROOM");
  await h.play(watcher, roomId, "timeout");
  const after = h.room(roomId);
  assert.equal(after.ludo.game.events.at(-1).type, "skip");
  assert.equal(currentPlayer(after), watcher);
});

test("a player who keeps timing out is removed from the room", async () => {
  const h = harness();
  const roomId = await h.lobby(["a", "b", "c"], { start: true });
  const afk = currentPlayer(h.room(roomId));
  for (let miss = 0; miss < 3; miss++) {
    while (currentPlayer(h.room(roomId)) !== afk) {
      const p = currentPlayer(h.room(roomId));
      h.rng.push(1);
      await h.play(p, roomId, "roll");
      if (h.room(roomId).ludo.game.turn.phase === "move") {
        await h.play(p, roomId, "move", { token: h.room(roomId).ludo.game.turn.legal[0] });
      }
    }
    h.clock.t = h.room(roomId).ludo.game.turn.deadline;
    const poker = ["a", "b", "c"].find((x) => x !== afk);
    await h.play(poker, roomId, "timeout");
  }
  const room = h.room(roomId);
  assert.equal(room.ludo.game.players.find((p) => p.id === afk).status, "left");
  assert.ok(!room.players.includes(afk));
  assert.equal(room.status, "playing", "two players remain");
});

test("play again returns everyone to the lobby with a fresh board", async () => {
  const h = harness();
  const roomId = await h.lobby(["alice", "bob", "carol"], { start: true });
  await rejects(h.act("alice", roomId, "restart"), "NOT_FINISHED");
  await h.act("carol", roomId, "leave");
  await h.act("bob", roomId, "leave");
  assert.equal(h.room(roomId).status, "finished");
  await h.act("dave", roomId, "join", { name: "dave" }).catch(() => {});
  await h.act("alice", roomId, "restart");
  const room = h.room(roomId);
  assert.equal(room.status, "waiting");
  assert.equal(room.ludo.game, null);
  assert.deepEqual(Object.keys(room.playerNames), ["alice"]);
  assert.equal(room.ludo.settings.maxPlayers, 2);
});

// ── Whole games over HTTP ────────────────────────────────────────────────────

async function withServer(h, fn, { rateLimit = { windowMs: 10_000, max: 1e9 } } = {}) {
  const app = express();
  app.use(express.json());
  const requireUser = (req, res, next) => {
    const uid = req.headers["x-test-uid"];
    if (!uid) return res.status(401).send({ error: "Please sign in." });
    req.user = { uid };
    next();
  };
  app.use("/ludo", createLudoRouter({ service: h.service, requireUser, rateLimit }));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/ludo`;
  const post = async (uid, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(uid ? { "x-test-uid": uid } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await fn(post);
  } finally {
    server.close();
  }
}

for (const count of [2, 3, 4]) {
  test(`a complete ${count}-player game over HTTP stays consistent for everyone`, async () => {
    const h = harness({ seed: 100 + count });
    await withServer(h, async (post) => {
      const names = ["ann", "ben", "cat", "dan"].slice(0, count);
      let n = 0;
      const action = (uid, roomId, type, extra = {}) =>
        post(uid, "/action", { roomId, action: { type, actionId: `http-${uid}-${++n}`, ...extra } });

      const created = await post(names[0], "/create", { name: "Ann", maxPlayers: count });
      assert.equal(created.status, 200);
      const { roomId } = created.body;
      for (const uid of names.slice(1)) {
        assert.equal((await action(uid, roomId, "join", { name: uid })).status, 200);
        assert.equal((await action(uid, roomId, "ready", { ready: true })).status, 200);
      }
      let res = await action(names[0], roomId, "start");
      assert.equal(res.status, 200);
      let room = res.body.room;
      let lastVersion = room.version;
      let steps = 0;

      while (room.status === "playing") {
        assert.ok(++steps < 6000, "game must finish");
        const game = room.ludo.game;
        const uid = game.players.find((p) => p.color === game.turn.color).id;
        const extra = game.turn.phase === "move" ? { token: game.turn.legal[n % game.turn.legal.length] } : {};
        res = await action(uid, roomId, game.turn.phase === "move" ? "move" : "roll", {
          ...extra,
          expectedVersion: room.version,
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.ok(res.body.room.version === lastVersion + 1, "every accepted action bumps the version by one");
        lastVersion = res.body.room.version;
        room = res.body.room;
        assert.deepEqual(room, h.room(roomId), "response matches the stored state");
      }

      const winner = room.ludo.game.winnerId;
      const winnerColor = room.ludo.game.players.find((p) => p.id === winner).color;
      assert.ok(room.ludo.game.tokens[winnerColor].every((p) => p === HOME_PROGRESS));
      for (const [color, list] of Object.entries(room.ludo.game.tokens)) {
        if (color !== winnerColor) assert.ok(list.some((p) => p !== HOME_PROGRESS));
        for (const p of list) assert.ok(p === BASE || (p >= 0 && p <= HOME_PROGRESS));
      }

      // After the game: late actions are refused cleanly, the host can restart.
      res = await action(names[1], roomId, "roll", { expectedVersion: room.version });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, "GAME_OVER");
      res = await action(names[0], roomId, "restart");
      assert.equal(res.body.room.status, "waiting");
    });
  });
}

test("HTTP errors: unauthenticated, malformed and unknown requests", async () => {
  const h = harness();
  await withServer(h, async (post) => {
    assert.equal((await post(null, "/action", {})).status, 401);
    let res = await post("u1", "/action", { roomId: "12", action: { type: "roll", actionId: "abcdefgh1" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "BAD_REQUEST");
    res = await post("u1", "/action", { roomId: "4321", action: { type: "roll", actionId: "abcdefgh2" } });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, "ROOM_NOT_FOUND");
    assert.equal(typeof res.body.serverTime, "number");
    const { body } = await post("u1", "/create", { name: "U" });
    res = await post("u1", "/action", { roomId: body.roomId, action: { type: "hack", actionId: "abcdefgh3" } });
    assert.equal(res.body.code, "BAD_REQUEST");
    res = await post("u1", "/action", { roomId: body.roomId, action: { type: "ready", actionId: "bad id!" } });
    assert.equal(res.body.code, "BAD_REQUEST");
  });
});

test("runaway clients are rate limited per player", async () => {
  const h = harness();
  await withServer(
    h,
    async (post) => {
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await post("spammer", "/action", { roomId: "0000" })).status);
      assert.deepEqual(statuses, [404, 404, 404, 429, 429]);
      assert.equal((await post("someone-else", "/action", { roomId: "0000" })).status, 404);
    },
    { rateLimit: { windowMs: 60_000, max: 3 } }
  );
});
