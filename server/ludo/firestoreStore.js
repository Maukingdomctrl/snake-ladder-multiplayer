// Firestore-backed store for the Ludo service (rooms collection, shared with
// Snakes & Ladders so room codes never collide between the two games).
"use strict";

const ROOM_FIELDS = ["game", "hostId", "players", "playerNames", "playerColors", "status", "version", "ludo"];
const ALREADY_EXISTS = 6; // gRPC status code

function pickRoom(data) {
  const room = {};
  for (const key of ROOM_FIELDS) if (data[key] !== undefined) room[key] = data[key];
  return room;
}

function createFirestoreStore(db, FieldValue) {
  const ref = (roomId) => db.collection("rooms").doc(roomId);

  return {
    async createIfAbsent(roomId, room) {
      try {
        await ref(roomId).create({
          ...pickRoom(room),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      } catch (error) {
        if (error.code === ALREADY_EXISTS) return false;
        throw error;
      }
    },

    transact(roomId, fn) {
      return db.runTransaction(async (t) => {
        const snap = await t.get(ref(roomId));
        const result = fn(snap.exists ? pickRoom(snap.data()) : null);
        if (result.deleted) {
          t.delete(ref(roomId));
        } else if (!result.unchanged) {
          t.update(ref(roomId), { ...pickRoom(result.room), updatedAt: FieldValue.serverTimestamp() });
        }
        return result;
      });
    },
  };
}

module.exports = { createFirestoreStore, pickRoom };
