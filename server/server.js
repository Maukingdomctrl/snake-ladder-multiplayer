const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

// 1. Enable CORS so your frontend can communicate with this server
app.use(cors({ origin: true }));
app.use(express.json());

// 2. Initialize Firebase Admin using your JSON key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 3. The Secure Room Creation Endpoint
app.post('/createRoom', async (req, res) => {
  try {
    const { hostId, hostName, hostColor } = req.body;

    if (!hostId) {
      return res.status(400).send({ error: "Missing hostId" });
    }

    let roomId = "";
    let roomRef;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    // Generate a unique 4-digit room code
    while (attempts < MAX_ATTEMPTS) {
      roomId = Math.floor(1000 + Math.random() * 9000).toString();
      roomRef = db.collection("rooms").doc(roomId);
      const snap = await roomRef.get();
      
      if (!snap.exists) break;
      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      return res.status(503).send({ error: "Servers at maximum capacity." });
    }

    // Write the room data securely
    await roomRef.set({
      hostId,
      players: [hostId],
      status: "waiting",
      currentTurn: hostId,
      lastDice: null,
      lastRolledBy: null,
      lastFrom: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      playerNames: {
        [hostId]: hostName || hostId,
      },
      playerColors: {
        [hostId]: hostColor,
      },
    });

    res.status(200).send({ roomId });

  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).send({ error: "Failed to create room." });
  }
});

// 4. Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running smoothly on port ${PORT}`);
});