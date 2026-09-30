# Snakes & Ladders — project notes

Multiplayer Snakes & Ladders. `web/` is the React + Vite app (deployed to Firebase
Hosting and Vercel), `server/` is the Express server on Render (creates rooms,
rolls dice, issues guest passes), Firestore holds game state and chat.
See README.md for deploy steps.

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
- Light theme, minimal clutter. Emoji render as Twemoji (Discord style), served
  from `web/public/twemoji` (copied at build time).
- Verify layout changes in a phone-sized browser (e.g. 412×820 and 360×700,
  plus a shrunken height to simulate the keyboard) before pushing.
