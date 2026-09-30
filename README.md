# Snakes & Ladders + Ludo — Multiplayer

| Piece | Where | What it does |
|---|---|---|
| `web/` | Vercel **and** Firebase Hosting | React app (guest sign-in, lobby, boards, chat) |
| `server/` | Render | Creates rooms, rolls dice and runs the Ludo rules (authoritative), verifies Firebase ID tokens |
| Firestore | `snake-ladder-maukingdom` | Live game state and chat |

## One-time Firebase setup
1. Console → **Authentication → Sign-in method** → enable **Anonymous** (players join with just a name).
2. Authentication → Settings → **Authorized domains**: add your Vercel domain
   (`snake-ladder-multiplayer-chi.vercel.app`). The `web.app`/`firebaseapp.com` domains are already there.

## Deploy
**Firebase (rules + hosting)** — from the repo root (the public web config is built into `web/src/firebase/index.ts`):
```bash
npm i -g firebase-tools && firebase login
firebase deploy --only firestore:rules,hosting
```

**Vercel** — project root directory `web/`, framework Vite. No env vars needed.
Deployments → Redeploy (or push to the connected branch).

**Render** — root directory `server/`, build `npm ci`, start `npm start` (also described in `render.yaml`).
Env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (from a service-account key).
Then Manual Deploy → Deploy latest commit.

> **Ludo needs all three deployed.** The Ludo rules run on the Render server (`/ludo/*` routes), and
> `firestore.rules` makes Ludo rooms server-write-only. Until Render is redeployed, creating a Ludo
> room shows "Ludo isn't available on the game server yet"; Snakes & Ladders is unaffected either way.

## Ludo
Pick **Ludo** on the join screen and create a room; others join with the room code (joining always
follows the code, whichever tab is selected). The host picks 2, 3 or 4 players in the lobby; the game
starts when every seat is filled and everyone is ready.

- **Rules (defaults):** roll a 6 to bring a token out; exact roll to reach home; landing on an
  opponent sends it back to base; start squares and ★ squares are safe; a 6, a capture or reaching
  home earns one extra roll; the third 6 in a row loses the turn; the first player with all four
  tokens home wins. Options such as blockades, other exit rolls, turn length and playing on for
  places live in `DEFAULT_SETTINGS` (`server/ludo/engine.js`).
- **Turn timer:** 30 s. Not rolling in time skips the turn, not picking a token plays the best move;
  three missed turns in a row remove the player. Leaving mid-game forfeits.
- **Authority:** the browser only sends intents ("roll", "move token 2") with the state version it
  saw and a unique action id. The server validates the turn, rolls the die, applies the move and
  writes the new state; stale or repeated requests are rejected or recognised, never applied twice.
  Clients replay the server's numbered event log as animations, and a refresh drops you back into
  your game.

| Code | What |
|---|---|
| `server/ludo/engine.js` | Pure rules engine (no I/O, injected RNG and clock) |
| `server/ludo/rooms.js` | Lobby and actions: seats, colours, ready, versions, de-duplication |
| `server/ludo/service.js`, `firestoreStore.js`, `router.js` | Transactions and HTTP routes |
| `web/src/games/ludo/` | Board, tokens, lobby, animation controller, room hook |

## Local dev
```bash
cd web && npm ci && npm run dev    # /render is proxied to the Render server
```

Fully local (no Render, no real project) with the Firebase emulators (needs Java):
```bash
firebase emulators:start --only firestore,auth --project demo-snake-ladder   # repo root
cd server && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_PROJECT_ID=demo-snake-ladder npm start
cd web && VITE_FIREBASE_EMULATORS=1 VITE_SERVER_URL=http://127.0.0.1:10000 npm run dev
```

## Tests
```bash
cd server && npm test                          # rules engine + multiplayer (rooms, HTTP, concurrency)
cd web && npm test && npm run typecheck        # UI and client logic (vitest + jsdom)
cd e2e && npm ci && npx playwright install chromium && npm test
```
The end-to-end suite starts the emulators, the server and the web app itself, then plays real
games in several browsers (both games, phones to desktop). It needs Java for the Firestore emulator.

## Dependency overrides
`npm audit` is clean in `web/`, `server/` and `e2e/`. Two `overrides` in `package.json` make that so
until upstream catches up — drop them once the parent packages ship the fixed versions:
- `server/`: `uuid ^11.1.1` — Google Cloud libraries under `firebase-admin` 13 still pull in uuid 8/9
  (they only call `uuid.v4()`, which v11 keeps). `firebase-admin` 14 would fix it but drops the API
  `server.js` uses and needs Node 22.
- `web/`: `@grpc/grpc-js ^1.14.5` — `firebase` still pins 1.9.x. It's only used by Firestore's
  Node.js build, never by the browser bundle.
