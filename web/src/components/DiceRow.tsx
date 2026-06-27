import React, { useState } from "react";
import Dice from "./Dice";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

interface DiceRowProps {
  onRoll: () => void | Promise<void>;
  disabled: boolean;
  lastDice: Face | null;
  rollKey: string;
  jumpMessage: string;
  onRollComplete?: () => void;
  onImpact?: (strength: number) => void;
  feedback?: boolean;
}

export default function DiceRow({
  onRoll,
  disabled,
  lastDice,
  rollKey,
  jumpMessage,
  onRollComplete,
  onImpact,
  feedback = true,
}: DiceRowProps) {
  const [isRolling, setIsRolling] = useState(false);

  const handleRoll = async () => {
    setIsRolling(true);
    await onRoll();
  };

  const handleRollComplete = () => {
    setIsRolling(false);
    if (onRollComplete) {
      onRollComplete();
    }
  };

  return (
    <div
      className={`dice-row-container ${isRolling ? "has-active-dice" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        marginTop: 6,
        marginBottom: 8,
        minHeight: 68,
        // NOTE on z-index: a previous pass tried to fix the
        // pill-vs-floating-chat-button overlap purely via z-index, which
        // only flips which element COVERS the other — it doesn't solve
        // two elements occupying the same screen region. The real fix is
        // in App.tsx: the floating chat button shrinks and slides
        // up-and-right whenever jumpMessage is set, so it no longer
        // overlaps this row at all — that fix is spatial, not z-index
        // based, so it still holds regardless of this row's z-index.
        //
        // BUG FIX (dice row rendering on top of the open chat drawer):
        // this was previously zIndex: 501 — one above the chat drawer's
        // z-index (var(--z-drawer) = 500) — so opening the drawer left
        // the dice row punching straight through it, on top of the
        // messages and input field. Since the FAB-overlap problem that
        // originally motivated raising this above 500 is already solved
        // spatially (see above), this row no longer needs to outrank the
        // drawer at all. Dropping it below 500 lets the drawer correctly
        // render on top of it while open.
        position: "relative",
        zIndex: 50,
        // BUG FIX (floating chat button dead during gameplay, works fine
        // in the lobby): this row is full-width and sits at z-index 501
        // — above the chat FAB's z-index 500 (var(--z-drawer)). The FAB
        // is position: fixed at bottom-right; this row's right-hand
        // empty flex spacer (below, present whenever jumpMessage is NOT
        // showing — i.e. almost all the time) physically overlaps that
        // same screen region on narrow viewports. Because the spacer had
        // no pointer-events override, its empty, invisible area was
        // still capturing taps and silently swallowing clicks meant for
        // the FAB underneath it. The button only appeared "dead" during
        // gameplay because that's the only app state where DiceRow (and
        // this overlap) exists at all — the lobby has no dice row, so
        // the FAB worked fine there. Setting pointerEvents: "none" on
        // the container itself, then explicitly re-enabling it only on
        // the actual visible/interactive content (the dice card and the
        // jump-message pill) below, lets clicks pass through the empty
        // space to whatever is actually underneath it.
        pointerEvents: "none",
      }}
    >
      <div style={{ flex: 1 }} />
      <div
        className="dice-action-block"
        style={{
          background: "var(--bg-tertiary)",
          borderRadius: 14,
          padding: "10px 20px",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)",
          flexShrink: 0,
          pointerEvents: "auto",
        }}
      >
        <Dice
          onRoll={handleRoll}
          disabled={disabled}
          lastDice={lastDice}
          rollKey={rollKey}
          onRollComplete={handleRollComplete}
          onImpact={onImpact}
          feedback={feedback}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "flex-start",
          paddingLeft: 20,
          minWidth: 0,
          // Stays non-interactive even when empty — only the pill inside
          // it (when present) would need pointer events, and the pill is
          // purely a status announcement with no click behavior anyway
          // (it already has pointerEvents: "none" below).
          pointerEvents: "none",
        }}
      >
        {jumpMessage && (
          <div
            role="status"
            aria-live="polite"
            className="jump-message-pill"
            style={{
              position: "relative",
              zIndex: 50,
              background: "var(--accent)",
              boxShadow: "var(--shadow-sm)",
              borderRadius: 20,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              whiteSpace: "normal",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.2)",
              pointerEvents: "none",
            }}
          >
            {jumpMessage}
          </div>
        )}
      </div>

      <style>{`
        /*
          BUG FIX (snake/ladder popup not showing correctly on mobile):
          previously the pill lived in a 'flex: 1' side spacer with
          whiteSpace: "nowrap". On a narrow phone, that spacer is only
          (screenWidth - diceWidth) / 2 wide — often under ~100-120px —
          so a message like "🪜 Ladder! 47 → 96" had nowhere near enough
          room and clipped/overflowed. Desktop keeps the original
          side-by-side look (capped width so it can't outgrow the row);
          narrow screens drop the pill to its own centered, full-width
          row below the dice instead of squeezing it into a sliver.
        */
        .jump-message-pill {
          max-width: min(60vw, 320px);
        }
        /*
          BUG FIX (Problem 1 — jump pill overlapping the chat FAB on
          phones wider than 480px): the breakpoint was 480px, but many
          modern phones report an effective CSS width above that (larger
          screens, some device pixel ratio / browser zoom combinations),
          so they fell through to the desktop side-by-side layout instead
          of wrapping. That let the dice block, jump pill, and chat FAB
          all try to occupy the same horizontal plane in the bottom-right
          corner. 768px matches the app's existing isTablet boundary
          (see App.tsx), so "mobile" here means the same thing it means
          everywhere else in the app — anything narrower than a tablet
          gets the wrapping layout.
        */
        @media (max-width: 768px) {
          .dice-row-container {
            flex-wrap: wrap;
            justify-content: center;
            row-gap: 6px;
          }
          .dice-row-container > div:first-child {
            display: none;
          }
          .dice-row-container > div:last-of-type {
            flex: 1 1 100%;
            justify-content: center;
            padding-left: 0;
          }
          .jump-message-pill {
            max-width: 92vw;
          }
          /*
            BUG FIX (Problem 2 — dice block too large on mobile): scales
            the entire dice card down evenly from its bottom-center point
            (so it shrinks toward the dice row's baseline rather than
            shifting position), freeing up vertical space in the bottom
            UI on phones without touching the desktop layout at all,
            since this rule only applies inside this same breakpoint.
          */
          .dice-action-block {
            transform: scale(0.85);
            transform-origin: bottom center;
          }
        }
      `}</style>
    </div>
  );
}