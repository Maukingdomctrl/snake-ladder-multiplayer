import { patchUrlMappings } from '@discord/embedded-app-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { setupDiscord } from './discord';

// 1. Set up the secure network tunnels FIRST
patchUrlMappings(
  [
    { prefix: "/firestore", target: "firestore.googleapis.com" },
    { 
      prefix: "/render", 
      target: "snake-ladder-multiplayer-c5ai.onrender.com",
      replacePrefix: "" // 👈 Setting this to an empty string strips the "/render" prefix entirely
    } 
  ],
  {
    patchFetch: true,
    patchWebSocket: true,
    patchXhr: true
  }
);

// 2. Initialize the application
async function init() {
  await setupDiscord().catch((e) => {
    console.warn("Discord setup skipped (likely running in browser):", e);
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

init();