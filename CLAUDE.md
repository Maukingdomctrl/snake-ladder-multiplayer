# Snakes & Ladders — project notes

Multiplayer Snakes & Ladders. `web/` is the React + Vite app (deployed to Firebase
Hosting and Vercel), `server/` is the Express server on Render (creates rooms,
rolls dice, issues guest passes), Firestore holds game state and chat.
See README.md for deploy steps.

## Ludo (second game mode)
- The server is the only authority: `server/ludo/engine.js` (pure rules, injected RNG/clock) and
  `server/ludo/rooms.js` (lobby + actions, `version` bump per write, `recentActions` de-dup). Clients
  send intents with `expectedVersion` + `actionId`; never let the web app compute legality or
  write Ludo state. `firestore.rules` keeps Ludo rooms (`game: "ludo"`) server-write-only.
- `web/src/games/ludo/board.ts` mirrors the engine's board constants for drawing;
  `board.test.ts` fails if they drift. The UI replays the server's event log
  (`usePresentation.ts`) and always settles on the authoritative token positions.
- Ludo shares the room shell with Snakes & Ladders (header, chat strip, FAB, `.board-stage`
  scaling via `useBoardStage`), so the mobile layout rules below apply to it too.
- Tests: `server` → `npm test`; `web` → `npm test`, `npm run typecheck`; `e2e` → Playwright
  against the Firebase emulators (see README).

## Desktop layout (>= 1200px wide)
- `isDesktop` in `web/src/App.tsx` switches the room to a three-column app: game panel (turn,
  players, dice) | board | chat, under a slim header. Styles live in section 7 of `App.css`
  (`--panel-w`, `--chat-w`, `.snl-game--desktop`, `.desktop-chat`) and, for Ludo, under
  `.is-desktop` in `ludo.css`. Below 1200px the phone/tablet layout is unchanged; keep desktop
  changes scoped so they never move anything on phones or tablets.

## Mobile layout rules — tuned with the owner, do not change without asking

These were adjusted step by step on a real phone. Treat them as requirements.

### Chat + dice while typing
- **Never change the height, size, position or visibility of the chat strip, the
  input bar, the dice row, the scoreboard or the header based on typing / focus /
  keyboard state.** No "compact while typing" modes, no hiding things on focus,
  no collapsing the input after sending or after tapping Roll Dice.
- The phone chat is a slim strip docked under the board: ~96px of scrollable
  messages + the input row, with the close ✕ inside the input row
  (`.mobile-chat` in `web/src/App.css`). It stays exactly like that until the
  user taps ✕.
- The keyboard stays open while chatting: taps on Send, Roll Dice, Reply, the
  board etc. must not steal focus from the message box (see the `keepFocus`
  handler in `web/src/components/Chat.tsx`). Only ✕ closes the chat/keyboard.
- The only thing allowed to react to the keyboard is the board: it is drawn at a
  stable base size and scaled with a smooth CSS transform (`.board-stage`,
  `baseDims` / `boardScale` in `web/src/App.tsx`). Never re-render the board at
  a new size on every viewport change.

### Join screen
- The join card must not move when the keyboard opens (like banking apps):
  the page uses `interactive-widget=overlays-content` outside a room and a
  fixed `100svh` height; its position/size is measured once on mount
  (`layout` in `web/src/components/LoginScreen.tsx`) and stretches to just above
  where the keyboard starts. Inside a room the app switches to
  `resizes-content` so the board/chat fit above the keyboard.

### General
- Chat messages are phone-chat-app bubbles: yours on the right (green), others
  on the left (grey) with the sender name on top and the time in the corner.
- Light theme, minimal clutter. Emoji render as Twemoji (Discord style), served
  from `web/public/twemoji` (copied at build time).
- Verify layout changes in a phone-sized browser (e.g. 412×820 and 360×700,
  plus a shrunken height to simulate the keyboard) before pushing.
