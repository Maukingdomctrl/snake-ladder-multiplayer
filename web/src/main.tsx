import { patchUrlMappings } from '@discord/embedded-app-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import App from './App';
import DiscordApp from './discord-activity/DiscordApp';
import { setupDiscord, isDiscord } from './discord';

// 1. Patch URLs immediately if running inside Discord
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
  const root = createRoot(document.getElementById('root')!);

  // 2. Render the loading screen immediately
  root.render(
    <div style={{
      width: '100%',
      height: '100vh',
      background: '#0d0d0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#c9a84c',
      fontSize: 14,
      fontFamily: 'Inter, sans-serif'
    }}>
      Loading...
    </div>
  );

  // 3. Wait for Discord SDK to initialize
  await setupDiscord().catch((e) => {
    console.warn("Discord setup skipped (likely running in browser):", e);
  });

  // 4. Mount the actual application
  root.render(
    <StrictMode>
      {isDiscord ? <DiscordApp /> : <App />}
    </StrictMode>
  );
}

init();