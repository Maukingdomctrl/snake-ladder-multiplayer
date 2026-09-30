# Snakes & Ladders — Multiplayer

| Piece | Where | What it does |
|---|---|---|
| `web/` | Vercel **and** Firebase Hosting | React app (guest sign-in, lobby, board, chat) |
| `server/` | Render | Creates rooms and rolls dice (authoritative), verifies Firebase ID tokens |
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

## Local dev
```bash
cd web && npm ci && npm run dev    # /render is proxied to the Render server
```
