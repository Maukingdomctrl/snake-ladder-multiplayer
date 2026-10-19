# Snakes & Ladders — project notes

Multiplayer Snakes & Ladders and Ludo, built as a Discord-like place where friends meet, play and
chat (chat matters as much as the game). `web/` is the React + Vite app (deployed to Firebase
Hosting and Vercel), `server/` is the Express server on Render (creates rooms, rolls dice, issues
guest passes, runs the Ludo rules), Firestore holds game state and chat. See README.md for deploy steps.

**Before any UI, layout, animation or styling change in `web/`, read the `game-ui` skill:
`.claude/skills/game-ui/SKILL.md`** (file map, rules, recipes, how to verify). Then run
`e2e/tests/layout.spec.ts` (it checks the layout rules below in a real browser) and look at the
screenshots it saves with `SHOTS=1`.

## Ludo (second game mode)
- The server is the only authority: `server/ludo/engine.js` (pure rules, injected RNG/clock) and
  `server/ludo/rooms.js` (lobby + actions, `version` bump per write, `recentActions` de-dup). Clients
  send intents with `expectedVersion` + `actionId`; never let the web app compute legality or
  write Ludo state. `firestore.rules` keeps Ludo rooms (`game: "ludo"`) server-write-only.
- `web/src/games/ludo/board.ts` mirrors the engine's board constants for drawing;
  `board.test.ts` fails if they drift. The UI replays the server's event log
  (`usePresentation.ts`) and always settles on the authoritative token positions.
- Ludo shares the room shell with Snakes & Ladders (header, chat, FAB, `.board-stage` scaling via
  `web/src/hooks/useBoardStage.ts`), so the phone rules below apply to it too.
- Tests: `server` → `npm test`; `web` → `npm test`, `npm run typecheck`; `e2e` → Playwright
  against the Firebase emulators (see README).

## Home page (join screen)
- Dark arcade design on every screen size, in `web/src/components/home/` (`home.css`).
  `LoginScreen.tsx` picks `DesktopHome` (window ≥ 1024px with a mouse) or `MobileHome`
  (phones/tablets); shared pieces are in `parts.tsx`.
- Phones: the room card must not move when the keyboard opens (like banking apps). The page uses
  `interactive-widget=overlays-content` outside a room and a fixed `100svh` height; the card's
  top offset and minimum height are measured once on mount (`layout` in `LoginScreen.tsx`) so it
  sits in the upper part of the screen that the keyboard leaves free. Inside a room the app
  switches to `resizes-content` so the board and chat fit above the keyboard.

## Desktop layout (>= 1200px wide)
- `isDesktop` in `web/src/App.tsx` switches the room to a three-column app: game panel (turn,
  players, dice card with a Roll Dice button) | board | chat, under a slim header. Styles live in
  section 7 of `App.css` (`--panel-w`, `--chat-w`, `.snl-game--desktop`, `.desktop-chat`) and, for
  Ludo, under `.is-desktop` in `ludo.css`. Keep desktop changes scoped so they never move anything
  on phones or tablets.

## Phone layout rules — set with the owner, do not change without asking

Tuned on real phones (big iPhones and Samsung Notes down to budget 360px phones). Treat them as
requirements.

### The board is the hero
- In a game the board runs nearly edge to edge, anchored right under the header (Ludo: under its
  turn banner); free space goes below it.
- The players live in the room header during a game (`GameHeader` children for S&L; Ludo portals
  its chips into `.header-slot`). The header always shows in a room. The highlighted chip is whose
  turn it is; there is no separate turn line.
- The die floats on the board and is the roll button — tap the die (S&L: bottom-right corner,
  Ludo: centre). No "Roll Dice" button or dice row on phones/tablets. It glows and hops on your
  turn, dims otherwise, scales with the board and stays at least a 44px target.
- Snake/ladder news and Ludo token picks pop up over the board; nothing is inserted into the layout.

### Chat + keyboard
- In a game the phone chat floats (`.mobile-chat--float`): only the input bar (with the close ✕
  inside it) takes a row. Messages fill the free space under the board, or float in front of the
  board's lower left on frosted glass when there's none (keyboard open), keeping clear of the die.
  The lobby keeps the docked strip (~96px of messages + the input row).
- **Never change the size, position or visibility of the header, the players, the chat input bar
  or the messages panel based on typing / focus / keyboard state.** No "compact while typing"
  modes, no hiding things on focus, no collapsing the input after sending or rolling.
- The keyboard stays open while chatting: taps on Send, the die, Reply, the board etc. must not
  steal focus from the message box (`keepFocus` in `web/src/components/Chat.tsx`). Only ✕ closes
  the chat/keyboard.
- The only thing allowed to react to the keyboard is the board (and what floats on it): it is
  drawn at a stable base size and scaled every frame with a CSS transform by `useBoardStage`.
  Never re-render the board at a new size on every viewport change.
- Keep keyboard handling cheap: the app frame is sized directly on its element (never via CSS
  variables on `<html>` — that restyles all ~25k board nodes per step) and glides 0.24s on
  phones/tablets. Height-based layout decisions use `useWindowDimensions().height`, the tallest
  height seen at this width, so the keyboard never flips them.

### General
- Chat messages are phone-chat-app bubbles: yours on the right (green), others on the left (grey)
  with the sender name on top and the time in the corner.
- Rooms use the light theme with minimal clutter; the home page is dark. Emoji render as Twemoji
  (Discord style), served from `web/public/twemoji` (copied at build time).
- Verify layout changes in a phone-sized browser (412×820, 360×700, 360×640, each also at half
  height to simulate the keyboard) before pushing: `e2e/tests/layout.spec.ts`.
