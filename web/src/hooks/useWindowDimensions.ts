import { useState, useEffect } from 'react';

/**
 * Window size for layout decisions. `height` is the tallest height seen at
 * the current width: the phone keyboard only ever makes the window shorter,
 * and nothing may change layout because it opened (CLAUDE.md), so opening it
 * doesn't even re-render. A new width (rotation) starts over.
 */
export function useWindowDimensions() {
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window !== "undefined") {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    return { width: 0, height: 0 };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setDimensions((d) => (width !== d.width || height > d.height ? { width, height } : d));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize); // FIX: Added orientationchange

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return dimensions;
}
