---
name: game-ui
description: How to change the look, layout, animation or feel of this Snakes & Ladders / Ludo web app (home page, rooms, board, dice, chat, players, header) safely on phones, tablets and desktop. Read it before any UI, CSS, layout, animation or "gaming experience" change in web/, however small.
---

# Changing the game UI: the guide

Written for Haiku and Sonnet working at low effort. It is long on purpose:
every rule here was learned from a real bug or a request from the owner.
Read it top to bottom once per session before you edit anything in `web/`.

How to use it:
1. Read sections 1–5 (what the product is, where things live, the rules).
2. Find your change in section 7 (recipes) and follow its steps in order.
3. Verify with section 8. Do not skip it, and never claim checks you didn't run.
4. If the request breaks a rule in section 4, stop and ask the owner first
   (section 10). Quote the rule in your question.

---

## 1. The product in one paragraph

A Discord-like place where friends meet, play Snakes & Ladders or Ludo, and
talk with emoji while they play. **Chat matters as much as the game.** Most
players are on phones: from big iPhones and Samsung Notes down to budget
phones (360px wide, ~560px of visible height). On a phone the **board is
the hero**: everything else is slim, sits in the header, or floats on or
over the board. The owner tests on a real phone and cares most about the
moment the keyboard opens: nothing may jump, shake or flash.

## 2. Map: where things live

| What | File(s) |
|---|---|
| Which home page renders, keyboard-stable card position | `web/src/components/LoginScreen.tsx` (`layout`, measured once) |
| Home page, desktop (wide + mouse) | `web/src/components/home/DesktopHome.tsx` |
| Home page, phones/tablets | `web/src/components/home/MobileHome.tsx` |
| Home page pieces shared by both (artwork, intro, tiles, steps, footer) | `web/src/components/home/parts.tsx` |
| Home page styles (dark arcade theme, `.gaming-home`, `.gh-*`, `.gh-m-*`) | `web/src/components/home/home.css` |
| Room shell: app frame sizing, header, columns, phone chat, chat button (FAB), S&L game view | `web/src/App.tsx` |
| Room header (+ the players slot on phones) | `web/src/components/GameHeader.tsx` |
| Chat (bubbles, emoji, replies, mentions, `keepFocus`) | `web/src/components/Chat.tsx` |
| 3D die; `floating` mode = the die is the roll button | `web/src/components/Dice.tsx` |
| Desktop side-panel dice card (S&L) | `web/src/components/DiceRow.tsx` |
| S&L players: slim chips (phones: in the header) or vertical list (desktop) | `web/src/components/Scoreboard.tsx` |
| S&L board drawing and token animation | `web/src/components/Board.tsx`, `web/src/components/snakes/*`, `web/src/constants.ts` |
| S&L lobby / countdown / winner | `Lobby.tsx`, `CountdownCard.tsx`, `WinnerOverlay.tsx` in `web/src/components/` |
| Board scaling + overlay for things on the board (both games) | `web/src/hooks/useBoardStage.ts` |
| Window size with a keyboard-proof height | `web/src/hooks/useWindowDimensions.ts` |
| Ludo screens | `web/src/games/ludo/components/*` (`LudoGameView.tsx` is the game) |
| Ludo styles | `web/src/games/ludo/ludo.css` |
| Ludo board constants (must match the server) | `web/src/games/ludo/board.ts` (+ `board.test.ts`) |
| Room styles, tokens, chat, floating die, desktop layout | `web/src/App.css` (sections below) |
| Layout guard tests (real browser) | `e2e/tests/layout.spec.ts` |

`App.css` sections, top to bottom: 1 design tokens (`:root`) · 2 reset & base
· 3 accessibility & scrollbars · 4 components (buttons, **chat**) · 5
animations · 6 accessibility overrides (reduced motion) · secondary button ·
**phone chat** · **app frame** · **board stage** · **phones/tablets: the
board is the hero** (`.board-overlay`, `.dice-float`, `.board-toast`,
`.header-game`, floating chat, `.score-chip`, `.dice-card`) · 7 desktop
layout · 8 control states. Search for the section comment before adding
CSS, and add new rules to the section they belong to.

The server is the only authority for game rules and dice (see CLAUDE.md →
Ludo). UI work never computes legality, never writes Ludo state, and always
lets the animation settle on the server's positions.

## 3. Screen sizes and how to target them

| Size | Meaning | How code knows |
|---|---|---|
| Phone | width < 768 | `!isTablet` in `App.tsx`; CSS `@media (max-width: 767px)` |
| Tablet | 768–1199 | `isTablet && !isDesktop` |
| Desktop room | width ≥ 1200 | `isDesktop`; CSS under `.is-desktop` (Ludo) or section 7 (`.snl-game--desktop`, `.desktop-chat`, `.app-header`) |
| Desktop home page | width ≥ 1024 **and** a mouse | `layout.desktop` in `LoginScreen.tsx`; CSS `.gaming-home--desktop` |
| Phone/tablet home page | everything else | `.gaming-home--mobile` |
| Hover effects | real mouse only | `@media (hover: hover) and (pointer: fine)` |

Decide the scope **before** editing: "phones only", "desktop only" or
"everywhere". Then prove the other sizes did not move (section 8). A phone
change must never move desktop, and a desktop change must never move phones.

## 4. Rules you must not break

These come from CLAUDE.md and the owner. Changing one needs the owner's yes.

**Board first (phones; both games)**
1. The board is the hero: nearly edge to edge, anchored right under the header
   (Ludo: under its turn banner). Free space goes **below** the board.
2. During a game the players live **in the header** (`GameHeader` children;
   Ludo portals into `.header-slot`). The header is always shown in a room.
3. The die floats **on** the board and **is** the roll button (tap the die):
   S&L bottom-right corner, Ludo centre. No "Roll Dice" button or dice row on
   phones/tablets. It glows and hops on your turn, dims otherwise, scales
   with the board (`--die-scale`), and is never smaller than a 44px target.
4. Snake/ladder news and Ludo token picks pop up **over the board**
   (`.board-toast`, `.board-picks`); nothing is inserted into the layout.

**Chat (phones)**
5. In a game the chat floats (`.mobile-chat--float`): only the input bar takes
   a row. Messages fill the free space under the board, or float in front of
   the board's lower-left on frosted glass when there's none (keyboard open),
   keeping clear of the die (`.is-over-board`). The lobby keeps the docked strip.
6. The keyboard stays open while chatting: taps on the die, the board, Send,
   Reply etc. must not steal focus (`keepFocus` in `Chat.tsx`). Only ✕ (inside
   the input row) closes the chat and the keyboard.
7. Bubbles: yours on the right (green), others on the left (grey) with the
   name on top and the time in the corner. Emoji are Twemoji.

**Keyboard (phones and tablets)**
8. When the keyboard opens, **only the board** (and what floats on it) reacts:
   it scales smoothly. Never change the size, position or visibility of the
   header, players, chat input bar or chat messages panel because of typing,
   focus or keyboard state. No "compact while typing" modes.
9. Layout decisions that depend on height use `useWindowDimensions().height`,
   which is the tallest height seen at this width, so the keyboard never
   flips them. Don't read `window.innerHeight` for layout (the one exception
   is `LoginScreen`, which reads it once on mount on purpose).

**Home page**
10. Dark arcade design on every size. On phones the room card keeps the
    position and minimum height measured once on mount (`LoginScreen`), so it
    never moves when the keyboard opens. Keep the labels the tests use:
    placeholders "Your name" / "Room code", buttons "Create room" /
    "Create Ludo room" / "Join", radios "Snakes & Ladders" / "Ludo".

**Everywhere**
11. Inputs use font-size ≥ 16px (iOS zooms otherwise). Tap targets ≥ 44px.
12. Rooms use the light theme; the home page is dark. Don't mix them.
13. Respect `prefers-reduced-motion` (App.css section 6 and home.css end
    already stop CSS animations; JS-driven motion must check it too).

## 5. Performance rules (why the phone UI used to shake)

The S&L board has ~25,000 styled elements (the snakes' scales are `<use>`
clones). Anything that restyles all of them is a visible freeze on a phone.

- **Never** set a CSS custom property, class or inline style on `<html>`,
  `<body>`, the app frame's ancestors, or any ancestor of the board in
  response to resize, scroll, keyboard or animation frames. One such write
  per keyboard step froze the page for seconds in a trace. Write sizes on
  the element that changes (the app frame, `.board-overlay`, `.mobile-chat`).
- Things that follow the layout every frame use a `ResizeObserver` and write
  styles directly (see `useBoardStage`). No debounce, no React state per
  frame, no CSS transition on top (it lags behind and overlaps things).
- Animate `transform` and `opacity`. The only animated layout changes are the
  short glides that are already there: the app frame height (0.24s), the
  chat strip slide (0.22s).
- No `scrollIntoView` or window scrolling in game code: with the keyboard open
  it pans the page.
- Don't add elements inside the board drawing casually; the static layer is
  memoized and should stay that way.

## 6. Animation guidelines

- Timing tokens in `App.css :root`: `--dur-fast` 0.12s, `--dur-base` 0.2s,
  `--dur-slow` 0.3s; easing `--ease-out` (UI), `--ease-spring` (pop-ins).
- Pop-ins (toasts, picks): ~0.3s spring, from scale 0.85–0.9 + opacity 0.
- Ambient loops (glow, hop): ≥ 1.4s, subtle, and only while they mean
  something (e.g. `is-ready` = your turn). Stop them when not needed.
- Press feedback on touch replaces hover lifts: `:active` scale 0.92–0.98.
- Dice timing is coupled: S&L `ROLL_MS` 4500 + `SETTLE_BUFFER_MS` 250 in
  `Dice.tsx`, fallback `DICE_FALLBACK_TIMEOUT_MS` 6000 in `App.tsx`; Ludo
  `LUDO_ROLL_MS` 1100 in `usePresentation.ts`. Change them together or not at all.
- Tokens move only after the dice settles (S&L `diceComplete` /
  `displayPositions`; Ludo replays the server's event log and always ends on
  the server's positions). Never animate ahead of the server.
- Test with reduced motion too: Playwright context `reducedMotion: "reduce"`.

## 7. Recipes

Each recipe lists the files and the checks. Always end with section 8.

**A. Change colours or the theme**
1. Rooms: change tokens in `App.css` section 1 (`:root`), not one-off colours.
   Home page: change `--gh-*` in `home.css` (`.gaming-home`) or `--home-bg`.
2. Check contrast of text on the new colours (WCAG AA: 4.5:1 for body text).
3. Screenshot phone + desktop, home + room.

**B. Change the home page**
1. Shared content (headline, artwork, tiles, steps, footer): edit `parts.tsx`
   once; both pages pick it up.
2. Desktop-only layout: `DesktopHome.tsx` + `.gaming-home--desktop` rules.
   Phone layout: `MobileHome.tsx` + `.gaming-home--mobile` / `.gh-m-*` rules.
3. Never move the phone room card (rule 10). Run the join-screen layout tests.

**C. Change the room layout on phones**
1. Read rules 1–9 again. If your change touches the header, players, chat
   or keyboard behaviour, ask first.
2. S&L lives in `App.tsx` (look for `.snl-game`, `BOARD AREA`, `boardStage`).
   Ludo lives in `LudoGameView.tsx` + `ludo.css`.
3. Keep the board area marked `data-content-end` (the floating chat measures
   the free space below it).
4. Run `layout.spec.ts` and look at the screenshots at 412×820 and 360×700.

**D. Add something that floats on the board**
1. Put it inside the game's `.board-overlay` (it matches the board as drawn;
   `--board-side` is its size, `--die-scale` the die's scale).
2. Position with `%` of the board, not pixels, so it stays on the same squares.
3. `pointer-events: none` unless it must be tapped; keep the die's corner free.
4. Pop it in with a short spring; make it disappear on its own if it's news.

**E. Change the dice (look, glow, roll)**
1. The die is `Dice.tsx`; `floating` is the phone/tablet mode, the classic
   button row is the desktop panel (`DiceRow.tsx`). Change both or say why not.
2. Glow/hop styles: `.dice-float` (phones), `.dice-card.is-ready` (desktop).
3. Keep the accessible name "Roll the dice" (tests use it) and the 44px target.
4. Don't touch the timing constants (section 6) unless asked.

**F. Change the chat**
1. Bubble look: App.css section 4 (`.bubble`, `.msg-*`). Floating panel:
   `.mobile-chat--float` rules. Behaviour: `Chat.tsx`.
2. Never break `keepFocus` or the ✕ inside the input row (rule 6).
3. Check: lobby (docked strip), game with chat open, game with keyboard open,
   messages arriving while the list is short (it must stay pinned to the
   newest message).

**G. Desktop-only change**
1. CSS in section 7 of `App.css` or under `.is-desktop` (Ludo); JS behind
   `isDesktop`. Nothing outside those may change.
2. Check 1280×720 and 1440×900 with a mouse context (no touch), and prove
   phones are unchanged (412×820, 360×700).

**H. Add a new animation**
1. Define keyframes next to the component's styles with a specific name.
2. Use the tokens; transform/opacity only; check reduced motion.
3. If it's tied to game events, trigger it from the settled state, not from
   the raw server update.

**I. Change the S&L board art**
1. `Board.tsx` and `components/snakes/*`; snake/ladder positions in
   `constants.ts` must match the server's rules.
2. Big boards are desktop, tiny boards are phones with the keyboard open:
   check both.

**J. Ludo-specific**
1. The server decides everything; the UI sends intents (CLAUDE.md → Ludo).
2. Board constants mirror the server: `board.test.ts` must still pass.

## 8. Verification (do all of it, then report honestly)

1. Fast checks:
   ```bash
   cd web && npm test && npm run typecheck && npm run lint && npm run build
   ```
2. Real-browser layout guard (starts the Firebase emulators, the game server
   and the web app itself; needs Java):
   ```bash
   cd e2e && npm ci
   CHROMIUM_PATH=/opt/pw-browsers/chromium SHOTS=1 npx playwright test tests/layout.spec.ts
   ```
   Then **look** at `e2e/screenshots/*.png` (use the Read tool on each file).
   Leave out `CHROMIUM_PATH` on a machine where `npx playwright install
   chromium` works.
3. Full end-to-end suite before pushing a room/game change (~5 min):
   `CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test` in `e2e/`.
4. Sizes to look at: phones 412×820, 360×700 and 360×640, each also at half
   height (keyboard); tablet 768×1024; desktop 1280×720 and 1440×900.
5. Emulating devices in Playwright:
   - Phone: `{ viewport, isMobile: true, hasTouch: true }`.
   - Desktop: a context **without** `hasTouch` (with touch, the desktop home
     page never renders because there is no mouse).
   - Keyboard: `page.setViewportSize({ width, height: height / 2 })` after
     focusing the input. Wait for animations to finish before measuring
     (`el.getAnimations().length === 0`).
6. Claiming "unchanged": compare screenshots against `main` pixel by pixel
   (run `main` in a `git worktree` on another port, freeze animations with
   `reducedMotion: "reduce"` and `animations: "disabled"`, wait for
   `document.fonts.ready`). If you only eyeballed it, say so.

## 9. Git and pull requests

- Work on the branch you were given. Small commits that say what changed and
  why (imperative subject, body with the reason and what was checked).
- PR body: `## Summary` (what the player sees), `## Not changed` (what you
  deliberately kept), `## Testing` (exact commands and sizes; what you did
  NOT check).
- Never report a visual check you didn't do. "Not checked on a real phone"
  is a fine, honest sentence.

## 10. Stop and ask the owner when…

- the request conflicts with a rule in section 4 (quote the rule);
- it changes how the keyboard, chat strip, header or players behave on phones;
- it removes a feature, a label the tests use, or an accessibility affordance;
- it touches game rules, dice timing or anything the server decides;
- you can't verify it in a browser.

Small, clearly scoped visual fixes inside these rules don't need a question:
do them, verify, and mention them.

## 11. Mistakes already made here (don't repeat them)

- Screenshots taken with `hasTouch: true` never show the desktop home page.
- The app shell's 12px side padding showed beige strips beside the dark home
  page; the home page now runs edge to edge.
- The room header used to vanish when the keyboard opened (height-based
  `isCompact`), making everything jump 44px.
- `--app-h` on `<html>` restyled the whole board on every keyboard step.
- A 50ms debounce + 0.22s transition let the board stick out of its area and
  cover the dice by up to 150px while resizing.
- The snake/ladder message added a row under the dice, shifting the layout
  after every snake or ladder.
- The scoreboard highlighted the next player as "rolling…" while the
  roller's dice was still rolling (server `currentTurn` moves early; use
  `lastRolledBy` until the dice settles).
- Short phones hid the lobby's room code.
- Tests measured the chat strip mid-animation.

## 12. Quick facts

- Board overlay vars: `--board-side` (board size on screen), `--die-scale`.
- Floating chat: `--chat-float-h` and `.is-over-board` on `.mobile-chat`,
  computed in `App.tsx` from the space under `[data-content-end]`.
- Header slot: `GameHeader` children (S&L chips) or `.header-slot` (Ludo portal).
- The app frame (`.app-frame`) is sized from `visualViewport` in `App.tsx`;
  `.is-gliding` animates its height on phones and tablets.
- `framer-motion` is installed but unused; prefer CSS animations.
