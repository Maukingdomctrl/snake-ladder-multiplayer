import { patchUrlMappings } from '@discord/embedded-app-sdk';

patchUrlMappings(
  [
    { prefix: "/firestore", target: "firestore.googleapis.com" },
    { prefix: "/render", target: "snake-ladder-multiplayer-c5ai.onrender.com" } // ⚠️ Replace this with your REAL Render URL (no https://)
  ],
  {
    patchFetch: true,
    patchWebSocket: true,
    patchXhr: true
  }
);