"use strict";

// In-memory stand-in for the Firestore store. Transactions on one room run
// one at a time (like Firestore's serializable transactions), with a tick of
// simulated I/O so concurrent requests genuinely interleave.

/** Fails the way Firestore would on undefined values or nested arrays. */
function assertStorable(value, path = "room") {
  if (value === undefined) throw new Error(`${path} is undefined (Firestore rejects undefined)`);
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      if (Array.isArray(v)) throw new Error(`${path}[${i}] is a nested array (Firestore rejects these)`);
      assertStorable(v, `${path}[${i}]`);
    });
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertStorable(v, `${path}.${k}`);
  } else if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path} is not a finite number`);
  }
}

function createMemoryStore() {
  const docs = new Map();
  const queues = new Map();
  let writes = 0;

  return {
    docs,
    writeCount: () => writes,

    async createIfAbsent(roomId, room) {
      await new Promise((r) => setImmediate(r));
      if (docs.has(roomId)) return false;
      assertStorable(room);
      docs.set(roomId, structuredClone(room));
      writes += 1;
      return true;
    },

    transact(roomId, fn) {
      const previous = queues.get(roomId) || Promise.resolve();
      const run = previous.then(async () => {
        await new Promise((r) => setImmediate(r));
        const current = docs.has(roomId) ? structuredClone(docs.get(roomId)) : null;
        const result = fn(current);
        if (result.deleted) {
          docs.delete(roomId);
          writes += 1;
        } else if (!result.unchanged) {
          assertStorable(result.room);
          docs.set(roomId, structuredClone(result.room));
          writes += 1;
        }
        return structuredClone(result);
      });
      queues.set(roomId, run.catch(() => {}));
      return run;
    },
  };
}

module.exports = { createMemoryStore, assertStorable };
