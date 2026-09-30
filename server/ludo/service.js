// Ludo service: runs room actions inside a store transaction so every action
// is validated and applied against the latest authoritative state.
//
// A store provides:
//   createIfAbsent(roomId, room) -> Promise<boolean>
//   transact(roomId, fn)         -> Promise<result of fn(currentRoom | null)>
//     fn returns { room, unchanged?, deleted? }; the store writes `room`
//     unless unchanged, or deletes the document when deleted.
"use strict";

const { LudoError } = require("./engine");
const rooms = require("./rooms");

const ROOM_ID_RE = /^\d{4}$/;

function createLudoService({ store, rng, now = () => Date.now() }) {
  return {
    async create(uid, body = {}) {
      const maxPlayers = body.maxPlayers === undefined ? 4 : body.maxPlayers;
      const room = rooms.createRoom({ uid, name: body.name, maxPlayers });
      for (let attempt = 0; attempt < 30; attempt++) {
        const roomId = String(rng.int(1000, 10000));
        if (await store.createIfAbsent(roomId, room)) return { roomId, room };
      }
      throw new LudoError("NO_CODES", "Couldn't find a free room code, please try again.", 503);
    },

    async act(uid, body = {}) {
      const roomId = String(body.roomId ?? "");
      if (!ROOM_ID_RE.test(roomId)) throw new LudoError("BAD_REQUEST", "Room code must be 4 digits.");
      const result = await store.transact(roomId, (current) =>
        rooms.applyAction(current, uid, body.action, { now: now(), rng })
      );
      if (result.deleted) return { roomId, deleted: true };
      return { roomId, room: result.room, duplicate: Boolean(result.duplicate) };
    },
  };
}

module.exports = { createLudoService };
