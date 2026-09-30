const { randomInt, randomUUID } = require("crypto");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { createLudoRouter } = require("./ludo/router");
const { createLudoService } = require("./ludo/service");
const { createFirestoreStore } = require("./ludo/firestoreStore");

// ── Environment Variable Check ──
console.log("ENV CHECK:", {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKeySet: !!process.env.FIREBASE_PRIVATE_KEY, 
});

// ── Firebase Admin Setup ──
// Local development / tests can run against the Firebase emulators
// (FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST), which need no key.
admin.initializeApp(
  process.env.FIRESTORE_EMULATOR_HOST
    ? { projectId: process.env.FIREBASE_PROJECT_ID || "demo-snake-ladder" }
    : {
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Render environment variables often escape newlines, this converts them back
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      }
);

const db = admin.firestore();
const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json()); // Essential for parsing req.body in POST requests

// ── Constants ──
// Unified Snakes & Ladders map matching client-side constants.ts
const BOARD_JUMPS = {
  // Ladders
  8: 26, 19: 38, 28: 53, 21: 82, 36: 57, 43: 77, 50: 91, 54: 88, 61: 99, 62: 95,
  // Snakes
  46: 15, 48: 9, 52: 11, 59: 18, 64: 24, 68: 2, 69: 33, 83: 22, 89: 51, 93: 37, 98: 13,
};

// ── Auth: every request carries the player's Firebase ID token ──
async function requireUser(req, res, next) {
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) return res.status(401).send({ error: "Please sign in." });
  try {
    req.user = await admin.auth().verifyIdToken(match[1]);
    next();
  } catch {
    res.status(401).send({ error: "Your session expired. Please sign in again." });
  }
}

// ── Guest passes ──
// Fallback for players whose direct anonymous sign-up is refused by Firebase
// (e.g. shared VPN addresses hit the per-IP sign-up limit): we mint a custom
// token here and the browser signs in with it.
const guestHits = new Map(); // ip -> { count, resetAt }
function guestRateLimited(ip) {
  const now = Date.now();
  const entry = guestHits.get(ip);
  if (!entry || entry.resetAt < now) {
    guestHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 20;
}

// ── Routes ──

// Health check (Render pings this; also handy for waking the free instance)
app.get("/", (_req, res) => res.send({ ok: true }));

// Guest pass for players whose direct sign-in failed
app.post("/guest", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
  if (guestRateLimited(ip)) return res.status(429).send({ error: "Too many attempts, try again in a minute." });
  try {
    const uid = `guest_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const token = await admin.auth().createCustomToken(uid);
    res.status(200).send({ token });
  } catch (error) {
    console.error("Error creating guest token:", error);
    res.status(500).send({ error: "Could not create guest pass" });
  }
});

// 1. Create Room Route
app.post('/createRoom', requireUser, async (req, res) => {
  try {
    const hostId = req.user.uid;
    const hostName = String(req.body.hostName || req.user.name || "Player").trim().slice(0, 20);
    const hostColor = String(req.body.hostColor || "#e5484d");

    // Generate unique 4-digit room code
    let roomId;
    let exists = true;
    while (exists) {
      roomId = Math.floor(1000 + Math.random() * 9000).toString();
      const snap = await db.collection("rooms").doc(roomId).get();
      exists = snap.exists;
    }

    // Initialize Room Data
    await db.collection("rooms").doc(roomId).set({
      hostId,
      players: [hostId],
      status: "waiting",
      currentTurn: hostId,
      playerNames: { [hostId]: hostName || hostId },
      playerColors: { [hostId]: hostColor || "#ff0000" },
      positions: { [hostId]: 1 },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastDice: null,
      lastRolledBy: null,
      lastFrom: null,
      winnerId: null,
      countdownEndsAt: null,
      moveCount: 0, // Initialized moveCount here
    });

    res.status(200).send({ roomId });

  } catch (error) {
    console.error("Error creating room:", error);
    res.status(400).send({ error: error.message || "Failed to create room" });
  }
});


// 2. Roll Dice Route
app.post('/roll', requireUser, async (req, res) => {
  try {
    const playerId = req.user.uid;
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).send({ error: "Missing roomId" });
    }

    const roomRef = db.collection("rooms").doc(roomId);

    const rollResult = await db.runTransaction(async (t) => {
      const roomDoc = await t.get(roomRef);

      if (!roomDoc.exists) {
        throw new Error("Room not found.");
      }

      const roomData = roomDoc.data();

      if (roomData.game === "ludo") {
        throw new Error("This room is playing Ludo.");
      }

      // Validate Game State
      if (roomData.status !== "playing") {
        throw new Error("Game is not in progress.");
      }

      // Strict Turn Validation
      if (roomData.currentTurn !== playerId) {
        throw new Error("It is not your turn.");
      }

      // Generate Authoritative Roll
      const dice = randomInt(1, 7);
      console.log(`🎲 Rolled: ${dice} for player ${playerId}`);

      // Calculate Base Position
      const currentPositions = roomData.positions || {};
      const lastFrom = currentPositions[playerId] || 1;
      let newPosition = Math.min(100, lastFrom + dice);

      // Calculate Snakes & Ladders Jumps
      if (BOARD_JUMPS[newPosition]) {
        newPosition = BOARD_JUMPS[newPosition];
      }

      // Game Progression Logic (Win State & Turn Advancement)
      const isFinished = newPosition >= 100;
      const players = roomData.players || [];
      const currentIndex = players.indexOf(playerId);
      const nextTurn = players[(currentIndex + 1) % players.length];

      // Write State
      t.update(roomRef, {
        lastDice: dice,
        lastRolledBy: playerId,
        lastFrom: lastFrom,
        [`positions.${playerId}`]: newPosition,
        currentTurn: isFinished ? playerId : nextTurn,
        status: isFinished ? "finished" : "playing",
        winnerId: isFinished ? playerId : null,
        moveCount: admin.firestore.FieldValue.increment(1),
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

// 3. Ludo (authoritative rules engine, see ./ludo)
app.use(
  "/ludo",
  createLudoRouter({
    service: createLudoService({
      store: createFirestoreStore(db, admin.firestore.FieldValue),
      rng: { int: (min, max) => randomInt(min, max) },
    }),
    requireUser,
  })
);

// ── Server Listen ──
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});