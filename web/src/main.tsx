import { patchUrlMappings } from '@discord/embedded-app-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import App from './App';
import { setupDiscord } from './discord';

// Only patch URL mappings when running inside Discord iframe
const isDiscord = window.location.ancestorOrigins?.contains('https://discord.com') 
  || window.parent !== window;

if (isDiscord) {
  patchUrlMappings(
    [
      { prefix: "/firestore", target: "firestore.googleapis.com" },
      {
        prefix: "/render",
        target: "snake-ladder-multiplayer-c5ai.onrender.com",
      }
    ],
    {
      patchFetch: true,
      patchWebSocket: true,
      patchXhr: true
    }
  );
}

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
