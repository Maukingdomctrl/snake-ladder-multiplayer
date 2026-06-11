const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// ── Firebase Admin Setup ──
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Render environment variables often escape newlines, this converts them back
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Constants ──
// Unified Snakes & Ladders map matching client-side constants.ts
const BOARD_JUMPS = {
  // Ladders
  8: 26, 19: 38, 28: 53, 21: 82, 36: 57, 43: 77, 50: 91, 54: 88, 61: 99, 62: 95,
  // Snakes
  46: 15, 48: 9, 52: 11, 59: 18, 64: 24, 68: 2, 69: 33, 83: 22, 89: 51, 93: 37, 98: 13,
};

// ── Routes ──
app.post('/roll', async (req, res) => {
  try {
    const { roomId, playerId } = req.body;

    if (!roomId || !playerId) {
      return res.status(400).send({ error: "Missing roomId or playerId" });
    }

    const roomRef = db.collection("rooms").doc(roomId);

    const rollResult = await db.runTransaction(async (t) => {
      const roomDoc = await t.get(roomRef);

      if (!roomDoc.exists) {
        throw new Error("Room not found.");
      }

      const roomData = roomDoc.data();

      // 1. Validate Game State
      if (roomData.status !== "playing") {
        throw new Error("Game is not in progress.");
      }

      // 2. Strict Turn Validation
      if (roomData.currentTurn !== playerId) {
        throw new Error("It is not your turn.");
      }

      // 3. Generate Authoritative Roll
      const dice = Math.floor(Math.random() * 6) + 1;

      // 4. Calculate Base Position
      const currentPositions = roomData.positions || {};
      const lastFrom = currentPositions[playerId] || 1;
      let newPosition = Math.min(100, lastFrom + dice);

      // 5. Calculate Snakes & Ladders Jumps
      if (BOARD_JUMPS[newPosition]) {
        newPosition = BOARD_JUMPS[newPosition];
      }

      // 6. Game Progression Logic (Win State & Turn Advancement)
      const isFinished = newPosition >= 100;
      const players = roomData.players || [];
      const currentIndex = players.indexOf(playerId);
      const nextTurn = players[(currentIndex + 1) % players.length];

      // 7. Write State
      t.update(roomRef, {
        lastDice: dice,
        lastRolledBy: playerId,
        lastFrom: lastFrom,
        [`positions.${playerId}`]: newPosition,
        currentTurn: isFinished ? playerId : nextTurn,
        status: isFinished ? "finished" : "playing",
        winnerId: isFinished ? playerId : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { dice, newPosition, isFinished };
    });

    res.status(200).send(rollResult);

  } catch (error) {
    console.error("Error rolling dice:", error);
    res.status(400).send({ error: error.message || "Failed to roll dice" });
  }
});

// ── Server Listen ──
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});