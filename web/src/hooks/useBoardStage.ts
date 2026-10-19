// The board is drawn at a stable base size and only scaled with a CSS
// transform when its area shrinks (phone keyboard, chat strip), so it glides
// instead of being re-rendered at a new size on every viewport change.
//
// The scale is written straight onto the stage element from a ResizeObserver,
// so it follows the area frame by frame while the keyboard or the chat strip
// slides: the board never sticks out of its area or covers the dice, and no
// React render happens while it shrinks. The board is only re-drawn when the
// area gets wider or narrower (rotation) or taller than it has been so far.
//
// Used by Snakes & Ladders (App.tsx) and Ludo (LudoGameView.tsx): put `ref`
// on the area, `stageRef` on the .board-stage element (no transform in its
// style prop), and draw the board at `width` x `side` (S&L) or `side` (Ludo).
// `overlayRef` goes on a .board-overlay inside the area: it gets the board's
// on-screen size as --board-side (and --die-scale for the floating die), so
// things can float on the board at the same place whatever its scale.
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useBoardStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState({ width: 0, side: 0 });
  const overlay = useRef<HTMLDivElement | null>(null);
  const baseSide = useRef(0);
  const areaSide = useRef(0);

  const applyScale = useCallback(() => {
    if (baseSide.current <= 0 || areaSide.current <= 0) return;
    const scale = Math.min(1, areaSide.current / baseSide.current);
    if (stageRef.current) stageRef.current.style.transform = `scale(${scale})`;
    // The overlay is not an ancestor of the board, so this restyles only it
    if (overlay.current) {
      const side = Math.round(baseSide.current * scale);
      overlay.current.style.setProperty("--board-side", `${side}px`);
      // The floating die (80px) covers about a sixth of the board
      overlay.current.style.setProperty("--die-scale", String(Math.max(0.5, Math.min(0.9, (side * 0.17) / 80))));
    }
  }, []);

  const overlayRef = useCallback(
    (el: HTMLDivElement | null) => {
      overlay.current = el;
      applyScale();
    },
    [applyScale]
  );

  // A callback ref, because the area can appear after the component mounts
  // (Snakes & Ladders shows it once the game starts).
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const measure = (w: number, h: number) => {
        const width = Math.floor(w);
        const height = Math.floor(h);
        if (width <= 0 || height <= 0) return;
        const side = Math.min(width, height);
        areaSide.current = side;
        setBase((b) => {
          if (Math.abs(b.width - width) > 2) return { width, side };
          if (side > b.side + 1) return { width: b.width, side };
          return b;
        });
        applyScale();
      };
      const ro = new ResizeObserver((entries) => {
        const rect = entries[entries.length - 1].contentRect;
        measure(rect.width, rect.height);
      });
      ro.observe(el);
      const rect = el.getBoundingClientRect();
      measure(rect.width, rect.height);
      return () => ro.disconnect();
    },
    [applyScale]
  );

  // Re-drawn at a new size: rescale against it before the browser paints.
  useLayoutEffect(() => {
    baseSide.current = base.side;
    applyScale();
  }, [base.side, applyScale]);

  return { ref, stageRef, overlayRef, width: base.width, side: base.side };
}
