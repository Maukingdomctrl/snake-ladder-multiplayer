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
        // now in App.tsx: the floating chat button shrinks and slides
        // up-and-right whenever jumpMessage is set, so it no longer
        // overlaps this row at all. This z-index is kept only as a small
        // safety margin against other low-z-index page content, not as
        // the mechanism that resolves the FAB conflict.
        position: "relative",
        zIndex: 501,
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
              zIndex: 501,
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
        @media (max-width: 480px) {
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
        }
      `}</style>
    </div>
  );
}