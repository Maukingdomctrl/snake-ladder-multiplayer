# Snakes & Ladders — Multiplayer

| Piece | Where | What it does |
|---|---|---|
| `web/` | Vercel **and** Firebase Hosting | React app (Google sign-in, lobby, board, chat) |
| `server/` | Render | Creates rooms and rolls dice (authoritative), verifies Google ID tokens |
| Firestore | `snake-ladder-maukingdom` | Live game state and chat |

## One-time Firebase setup
1. Console → **Authentication → Sign-in method** → enable **Google**.
2. Authentication → Settings → **Authorized domains**: add your Vercel domain
   (e.g. `snake-ladder-multiplayer.vercel.app`). The `web.app`/`firebaseapp.com` domains are already there.

## Deploy
**Firebase (rules + hosting)** — from the repo root, with `web/.env.local` filled in (see `web/.env.example`):
```bash
npm i -g firebase-tools && firebase login
firebase deploy --only firestore:rules,hosting
```

**Vercel** — project root directory `web/`, framework Vite. Add the `VITE_FIREBASE_*` env vars
(Settings → Environment Variables), then Deployments → Redeploy (or push to the connected branch).

**Render** — root directory `server/`, build `npm ci`, start `npm start` (also described in `render.yaml`).
Env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (from a service-account key).
Then Manual Deploy → Deploy latest commit.

## Local dev
```bash
cd web && npm ci && npm run dev    # /render is proxied to the Render server
```
