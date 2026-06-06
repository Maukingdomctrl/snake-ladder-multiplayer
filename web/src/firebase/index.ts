import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Initialize the Admin SDK. 
// This gives the server full database access, bypassing client-side security rules.
admin.initializeApp();
const db = admin.firestore();

// Create an HTTP endpoint that your React app can safely call
export const createRoom = onRequest({ cors: true }, async (req, res) => {
  try {
    // 1. Ensure this is a POST request and grab the user details
    if (req.method !== "POST") {
      res.status(405).send({ error: "Method Not Allowed" });
      return;
    }

    const { hostId, hostName, hostColor } = req.body.data || req.body;

    if (!hostId) {
      res.status(400).send({ error: "Missing hostId" });
      return;
    }

    let roomId = "";
    let roomRef;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    // 2. Generate a unique 4-digit room code
    while (attempts < MAX_ATTEMPTS) {
      roomId = Math.floor(1000 + Math.random() * 9000).toString();
      roomRef = db.collection("rooms").doc(roomId);
      const snap = await roomRef.get();
      
      if (!snap.exists) break;
      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      res.status(503).send({ error: "Servers at maximum capacity." });
      return;
    }

    // 3. Write the room data securely using the Admin SDK
    await roomRef!.set({
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

    // 4. Send the new room ID back to the frontend
    // We wrap it in a 'data' object so it works seamlessly with Firebase's client SDK
    res.status(200).send({ data: { roomId } });

  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).send({ error: "Failed to create room." });
  }
});