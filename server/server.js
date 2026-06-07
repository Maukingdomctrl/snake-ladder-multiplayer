const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

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
      playerNames: { [hostId]: hostName || hostId },
      playerColors: { [hostId]: hostColor },
    });

    res.status(200).send({ roomId });

  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).send({ error: "Failed to create room." });
  }
});

app.post('/token', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).send({ error: "Missing code" });
    }

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Discord token exchange failed:", data);
      return res.status(400).send({ error: "Token exchange failed", details: data });
    }

    res.status(200).send({ access_token: data.access_token });

  } catch (error) {
    console.error("Error exchanging token:", error);
    res.status(500).send({ error: "Failed to exchange token" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});