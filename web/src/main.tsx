import { patchUrlMappings } from '@discord/embedded-app-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { setupDiscord } from './discord';

// 1. Set up the secure network tunnels FIRST (Before React or Firebase load)
patchUrlMappings(
  [
    { prefix: "/firestore", target: "firestore.googleapis.com" },
    { prefix: "/render", target: "snake-ladder-multiplayer-c5ai.onrender.com" } 
  ],
  {
    patchFetch: true,
    patchWebSocket: true,
    patchXhr: true
  }
);

// 2. Initialize the application
async function init() {
  // Try to set up Discord — works inside Discord, gracefully skips in browser
  await setupDiscord().catch((e) => {
    console.warn("Discord setup skipped (likely running in browser):", e);
  });

  // Render the React App
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

init();