// Same approach as the Snakes & Ladders board (App.tsx baseDims/boardScale):
// the board is drawn at a stable base size and only scaled with a CSS
// transform when its area shrinks (phone keyboard, chat strip), so it glides
// instead of being re-rendered at a new size on every viewport change.
import { useEffect, useRef, useState } from "react";

export function useBoardStage() {
  const ref = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [base, setBase] = useState({ width: 0, side: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = (width: number, height: number) => {
      if (width > 0 && height > 0) setArea({ width: Math.floor(width), height: Math.floor(height) });
    };
    const ro = new ResizeObserver((entries) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const rect = entries[entries.length - 1].contentRect;
        measure(rect.width, rect.height);
      }, 50);
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    measure(rect.width, rect.height);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const { width, height } = area;
    if (width <= 0 || height <= 0) return;
    const side = Math.min(width, height);
    setBase((b) => {
      if (Math.abs(b.width - width) > 2) return { width, side };
      if (side > b.side + 1) return { width: b.width, side };
      return b;
    });
  }, [area]);

  const side = Math.min(area.width, area.height);
  const scale = base.side > 0 ? Math.min(1, side / base.side) : 1;
  return { ref, side: base.side, scale, areaWidth: area.width };
}
