import { patchUrlMappings } from '@discord/embedded-app-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import App from './App';
import DiscordApp from './discord-activity/DiscordApp';
import { setupDiscord, isDiscord } from './discord';

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
      {isDiscord ? <DiscordApp /> : <App />}
    </StrictMode>,
  );
}

init();