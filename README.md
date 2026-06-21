# Snakes & Ladders Multiplayer — Architecture README

## Live URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Vercel (frontend) | `https://snake-ladder-multiplayer.vercel.app` | Website + Discord Activity host |
| Render (backend) | `https://snake-ladder-multiplayer-c5ai.onrender.com` | Room creation API + Discord token exchange |
| Firebase Firestore | `snake-ladder-maukingdom` project | Real-time game state database |
| Discord Activity | Embedded in Discord voice channels | Game iframe via discordsays.com |

---
Render Backend Setup
Service: snake-ladder-multiplayer-c5ai.onrender.com
Type: Web Service
Runtime: Node 18+
Root directory: server/
Start command: node server.js



DISCORD_CLIENT_ID=****
DISCORD_CLIENT_SECRET=****
PORT=5000

Files
server/
├── server.js              # Express app — /createRoom and /token endpoints
├── serviceAccountKey.json # Firebase Admin credentials — NEVER commit to git
└── package.json           # engines: node >=18
Important Notes

serviceAccountKey.json must be manually uploaded to Render — it is gitignored and never pushed to GitHub
Render free tier sleeps after 15 minutes of inactivity — first room creation after sleep takes ~30 seconds
fetch is used natively — Node 18+ is required, set in package.json under engines
The /token endpoint calls https://discord.com/api/oauth2/token directly from Render — Discord's OAuth2 server returns the access_token which is passed back to the frontend



## How the Three Services Connect

```
Discord iframe
     │
     │  patchUrlMappings intercepts requests
     │
     ├──/render/* ──────────────► Render backend (Express)
     │                               ├── POST /createRoom
     │                               └── POST /token
     │
     └──/firestore/* ───────────► Firebase Firestore
                                     ├── rooms/{roomId}
                                     ├── rooms/{roomId}/messages
                                     ├── rooms/{roomId}/moves
                                     └── instances/{instanceId}

Browser (website)
     │
     ├── fetch /render/createRoom ─► Render (via Vite proxy in dev, Vercel rewrite in prod)
     └── Firebase SDK direct ──────► Firebase Firestore
```

---

## Repository Structure

```
snake-ladder-multiplayer/
├── web/                          # Frontend — deployed to Vercel
│   ├── src/
│   │   ├── App.tsx               # Root component, all game state, routing between screens
│   │   ├── App.css               # CSS variables (sepia dark theme), global styles
│   │   ├── main.tsx              # Entry point — inits Discord SDK, renders App
│   │   ├── discord.ts            # Discord SDK setup, auth flow, token exchange
│   │   ├── constants.ts          # SNAKES, LADDERS, LOBBY_COLORS, PLAYER_COLORS, etc.
│   │   ├── declarations.d.ts     # TypeScript declarations for CSS imports, ImportMeta.env
│   │   │
│   │   ├── firebase/
│   │   │   ├── index.ts          # Firebase app init, Firestore instance export
│   │   │   └── rooms.ts          # All Firestore functions: createRoom, joinRoom, rollDice, etc.
│   │   │
│   │   ├── hooks/
│   │   │   ├── usePlayerStorage.ts   # playerId, playerName, playerColor from localStorage/Discord
│   │   │   ├── useGameSync.ts        # Countdown timer, finalizeGameStart trigger
│   │   │   └── useWindowDimensions.ts # window width/height, drives isCompact layout flag
│   │   │
│   │   └── components/
│   │       ├── Board.tsx         # 10x10 board render, snake/ladder SVG, token animation engine
│   │       ├── Dice.tsx          # 3D CSS dice, roll animation, onRollComplete callback
│   │       ├── DiceRow.tsx       # Dice + jump message wrapper
│   │       ├── Chat.tsx          # Message list, emoji picker, send input
│   │       ├── Lobby.tsx         # Waiting room — player list, color picker, start button
│   │       ├── LoginScreen.tsx   # Name input, create/join room (website only)
│   │       ├── GameHeader.tsx    # Top bar with room ID and player dots
│   │       ├── CountdownCard.tsx # 5-second countdown before game starts
│   │       ├── Scoreboard.tsx    # Horizontal player ranking strip
│   │       └── WinnerOverlay.tsx # Full-screen winner announcement with confetti
│   │
│   ├── public/
│   │   └── favicon.svg
│   ├── vercel.json               # Vercel rewrite rules: /render/* → Render backend
│   ├── vite.config.ts            # Vite dev proxy: /render/* → Render, /.proxy → Discord
│   ├── tsconfig.json
│   └── package.json
│
└── server/                       # Backend — deployed to Render
    ├── server.js                 # Express server: /createRoom, /token endpoints
    ├── serviceAccountKey.json    # Firebase Admin credentials (never commit — gitignored)
    └── package.json              # Node >=18 required (for native fetch)
```

---

## File-by-File: What Talks to What

### `main.tsx`
- Imports `isDiscord` and `setupDiscord` from `discord.ts`
- Calls `patchUrlMappings` (only when `isDiscord`) to route `/render/*` and `/firestore/*` through Discord's proxy
- Calls `setupDiscord()` then renders `<App />`

### `discord.ts`
- Detects Discord via URL params (`frame_id`, `instance_id`, `guild_id`, etc.) and hostname
- Creates `DiscordSDK` or `DiscordSDKMock` depending on `isDiscord`
- `setupDiscord()`: calls `discordSdk.ready()` → `authorize()` → `fetch /render/token` → `discordSdk.commands.authenticate()`
- Exports `isDiscord`, `discordSdk`, `getDiscordUser()`

### `App.tsx`
- Imports `isDiscord` from `discord.ts`
- Uses `usePlayerStorage` for identity, `useGameSync` for countdown, `useWindowDimensions` for layout
- `isCompact = isDiscord || height < 700` — drives compact layout everywhere
- Discord auto-join: on mount, reads `instance_id` from URL → `getInstanceRoom()` → joins or creates room → `setInstanceRoom()`
- Subscribes to Firestore room via `subscribeRoom()` and messages via `subscribeMessages()`
- Passes `diceComplete` to `Board` and `onRollComplete` to `DiceRow`/`Dice` for animation sync

### `firebase/rooms.ts`
- `createRoom()` → `fetch /render/createRoom` (Render backend creates the Firestore doc securely)
- `joinRoom()` → direct Firestore `updateDoc`
- `rollDice()` → Firestore `runTransaction` (atomic, prevents double-rolls)
- `subscribeRoom()` → Firestore `onSnapshot` real-time listener
- `getInstanceRoom()` / `setInstanceRoom()` → `instances` collection, maps Discord `instanceId` to `roomId`

### `server/server.js`
- `POST /createRoom` → Firebase Admin SDK creates room doc in Firestore
- `POST /token` → exchanges Discord OAuth2 code for `access_token` using `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`
- Uses Firebase Admin (not client SDK) — has full write access via `serviceAccountKey.json`

---

## Environment Variables

### Vercel (web frontend)
```
VITE_DISCORD_CLIENT_ID=1512684082826449016
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=snake-ladder-maukingdom
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Render (backend)
```
DISCORD_CLIENT_ID=1512684082826449016
DISCORD_CLIENT_SECRET=...
PORT=5000
```

### Local dev (.env in web/)
Same as Vercel vars above.

---

## Request Flow: Creating a Room

```
1. User clicks "Create New Room" (website)
   OR
   User opens Activity in Discord voice channel

2. App.tsx calls createRoom(playerId, playerName, playerColor)

3. rooms.ts sends POST /render/createRoom
   - In dev:    Vite proxy routes to Render directly
   - In prod:   Vercel rewrite routes /render/* to Render
   - In Discord: patchUrlMappings routes /render/* through Discord proxy to Render

4. Render server receives request
   - Generates unique 4-digit roomId
   - Uses Firebase Admin to write room doc to Firestore
   - Returns { roomId }

5. App.tsx sets activeRoomId
   - subscribeRoom() starts Firestore onSnapshot listener
   - Real-time updates flow directly from Firestore to all clients
```

## Request Flow: Discord Auto-Join

```
1. User opens Activity → Discord passes instance_id in URL params

2. main.tsx detects isDiscord=true → patchUrlMappings active

3. App.tsx autoJoin() effect runs:
   a. getInstanceRoom(instanceId) → checks Firestore instances collection
   b. If room exists → joinRoom(existingRoomId, ...) → Firestore updateDoc
   c. If no room → createRoom(...) → Render → new room → setInstanceRoom(instanceId, roomId)

4. All players in the same voice channel share the same instanceId
   → They all land in the same Firestore room automatically
   → No room codes needed
```

## Request Flow: Rolling Dice

```
1. Player clicks "Roll Dice"

2. rollDice() runs Firestore transaction:
   - Reads current room state atomically
   - Calculates new position (applies SNAKES_AND_LADDERS map)
   - Writes new position, currentTurn, lastDice, lastFrom, lastRolledBy

3. All clients receive update via onSnapshot

4. Dice.tsx plays 2.8s animation → calls onRollComplete
   → App.tsx sets diceComplete=true after 2s delay
   → Board.tsx animation engine fires, moves token step by step

5. Observer clients (not the roller) have a 4s fallback timeout
   → If diceComplete never fires, Board animates anyway
```

---

## Firestore Collections

```
rooms/{roomId}
  hostId: string
  players: string[]
  status: "waiting" | "countdown" | "playing" | "finished"
  currentTurn: string
  positions: { [playerId]: number }
  playerNames: { [playerId]: string }
  playerColors: { [playerId]: string }
  lastDice: number
  lastRolledBy: string
  lastFrom: number
  winnerId: string | null
  countdownEndsAt: number | null
  createdAt: Timestamp
  updatedAt: Timestamp

rooms/{roomId}/messages/{msgId}
  playerId: string
  playerName: string
  text: string
  at: Timestamp

rooms/{roomId}/moves/{moveId}
  playerId: string
  dice: number
  at: Timestamp

instances/{instanceId}
  roomId: string
  updatedAt: Timestamp
```

---

## Key Design Decisions

**Why Render for room creation?**
Firebase client SDK rules would allow any client to create malformed rooms. Render backend uses Firebase Admin SDK with no restrictions — it validates input and guarantees room structure.

**Why Firestore for real-time?**
All game state lives in Firestore. Every client subscribes via `onSnapshot` — no WebSocket server needed. Discord's `patchUrlMappings` handles the Firestore proxy inside the iframe.

**Why `instanceId` for Discord auto-join?**
Discord gives every Activity session a unique `instance_id`. All players in the same voice channel share it. Storing `instanceId → roomId` in Firestore means no room codes are ever needed inside Discord.

**Why `isCompact` instead of `isDiscord` for layout?**
`isCompact = isDiscord || height < 700` means the compact layout also applies to small browser windows on the website. One flag handles all cramped viewports universally.





## Changelog

### 08-06-2026
- Isolated Discord Activity into dedicated `src/discord-activity/` folder — `DiscordApp.tsx`, `DiscordLobby.tsx`, `DiscordGameView.tsx`, `DiscordLayout.tsx` — website (`App.tsx`) untouched
- Redesigned Discord UI with "The Kingdom" tavern theme — dark `#0d0d0f` background, gold `#c9a84c` accents, lobby renamed to "The Tavern", chat renamed to "tavern-chat"
- Fixed Discord iframe viewport using `position: fixed` in `DiscordLayout.tsx` — no more overflow or scroll issues
- Discord auto-join via `instanceId` — players in the same voice channel land in the same room automatically, no room codes needed
- Removed duplicate `isDiscord` detection — single source of truth in `discord.ts`
- Fixed token exchange flow — Discord OAuth2 code now exchanged via Render `/token` endpoint, real Discord usernames resolved
- Added `useWindowDimensions` hook — `isCompact` flag drives layout for both Discord and small browser windows universally
- Temporarily disabled 2-player minimum for solo testing


09-06-2026

Moved dice roll logic server-side — rollDice() in rooms.ts now calls POST /render/roll instead of running a client-side Firestore transaction, preventing players from manipulating rolls
Server /roll endpoint now handles full game progression: turn advancement, win detection, status/winnerId/currentTurn written atomically in the same transaction
Unified snake/ladder map — server BOARD_JUMPS now matches constants.ts exactly, fixing silent position divergence between client rendering and server state
finalizeGameStart() converted to runTransaction with CAS check on status inside the transaction, preventing multiple clients from double-initialising the game on countdown end
leaveRoom() now called in onLeaveRoom() in both App.tsx and DiscordApp.tsx — players who leave are properly removed from the room instead of staying in the player list indefinitely
Removed hardcoded Firebase API key from firebase/index.ts — config now uses env vars only
Lobby.tsx Start Game button re-enforces 2-player minimum (disabled when players.length < 2)
Board.tsx animation timeouts now use cellSizeRef instead of closed-over cellSize state, fixing token snap to wrong positions on window resize mid-animation; added isMounted guard to prevent setTokenPixels calls after unmount
Chat.tsx emoji picker now closes on click-outside via mousedown listener on document
useWindowDimensions initial state guarded for SSR safety; switched to visualViewport?.height to prevent iOS keyboard from resizing the board
DiscordApp.tsx auto-join effect dependency array narrowed from [playerId, playerName, playerColor] to [playerId, playerName] — color changes no longer trigger re-join attempts
DiscordLayout.tsx root container changed from position: fixed to position: relative + height: 100dvh