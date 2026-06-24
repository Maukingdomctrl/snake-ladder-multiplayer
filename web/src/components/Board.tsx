// src/components/Board.tsx

import { useMemo, useEffect, useRef, useState } from "react";
import Snake from "./snakes/Snake";
import type { SnakeColors } from "./snakes/shared/types";
import {
  SNAKES,
  LADDERS,
  PLAYER_COLORS,
  CELL_COLORS,
  CLASSIC_SNAKES,
  CLUSTER_OFFSETS,
} from "../constants";
import type { Room } from "../firebase/rooms";

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getCellColor(num: number) {
  const rowFromBottom = Math.floor((num - 1) / 10);
  const posInRow = (num - 1) % 10;
  const col = rowFromBottom % 2 === 0 ? posInRow : 9 - posInRow;
  let index = (col - rowFromBottom) % 4;
  if (index < 0) index += 4;
  return CELL_COLORS[index];
}

function cellToPos(num: number) {
  const rowFromBottom = Math.floor((num - 1) / 10);
  const row = 9 - rowFromBottom;
  const col = rowFromBottom % 2 === 0 ? (num - 1) % 10 : 9 - ((num - 1) % 10);
  return { row, col };
}

function cellCenter(num: number, cellSize: number) {
  const { row, col } = cellToPos(num);
  return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

function getWaypointCenter(wp: { c: number; ox?: number; oy?: number }, cellSize: number) {
  const { row, col } = cellToPos(wp.c);
  return {
    x: col * cellSize + cellSize / 2 + (wp.ox || 0) * cellSize,
    y: row * cellSize + cellSize / 2 + (wp.oy || 0) * cellSize,
  };
}

function getPidHash(pid: string) {
  return pid.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function getPlayerColor(pid: string) {
  return PLAYER_COLORS[getPidHash(pid) % PLAYER_COLORS.length];
}

function getClusterOffset(pid: string) {
  return CLUSTER_OFFSETS[getPidHash(pid) % CLUSTER_OFFSETS.length];
}

function squareToPixel(squareNum: number, pid: string, cellSize: number) {
  const { row, col } = cellToPos(squareNum);
  const offset = getClusterOffset(pid);
  return {
    x: col * cellSize + cellSize / 2 + offset.x,
    y: row * cellSize + cellSize / 2 + offset.y,
  };
}

function calculateBoardMetrics(
  containerWidth: number,
  containerHeight: number
): { cellSize: number; borderPadding: number } {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { cellSize: 50, borderPadding: 14 };
  }

  const minDim = Math.min(containerWidth, containerHeight);
  const borderPadding = Math.max(4, Math.min(14, Math.round(minDim * 0.025)));

  const availW = containerWidth - borderPadding * 2;
  const availH = containerHeight - borderPadding * 2;

  const maxBoardSize = Math.min(availW, availH);
  const cellSize = Math.max(18, Math.floor(maxBoardSize / 10));

  return { cellSize, borderPadding };
}

// ── Animation path helpers ────────────────────────────────────────────────────

function getPointsAlongLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number
) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return points;
}

function getPointsAlongCurve(
  a: { x: number; y: number },
  b: { x: number; y: number },
  waveDir: number,
  steps: number,
  curveFactor: number = 0.15
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return getPointsAlongLine(a, b, steps);

  const nx = -dy / dist;
  const ny = dx / dist;
  const offset = dist * curveFactor * waveDir;

  const cp1x = a.x + dx * 0.25 + nx * offset;
  const cp1y = a.y + dy * 0.25 + ny * offset;
  const cp2x = a.x + dx * 0.75 - nx * offset;
  const cp2y = a.y + dy * 0.75 - ny * offset;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt*mt*mt*a.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*b.x,
      y: mt*mt*mt*a.y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*b.y,
    });
  }
  return points;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoardProps {
  positions?: Record<string, number>;
  playerNames?: Record<string, string>;
  roomData?: Room | null;
  hideLegend?: boolean;
  diceComplete?: boolean;
  dimensions?: { width: number; height: number };
}

// ★ NEW: Track duration and easing dynamically for lag-free token updates
interface TokenState {
  x: number;
  y: number;
  duration: number;
  ease: string;
}

// ── Per-snake visual config ───────────────────────────────────────────────────

const SNAKE_WAYPOINTS: Record<number, { c: number; ox?: number; oy?: number }[]> = {
  83: [
    { c: 83 }, { c: 78, ox: 0.4 }, { c: 63, ox: -0.4 }, { c: 58, ox: 0.5 },
    { c: 43, ox: -0.5 }, { c: 38, ox: -0.4 }, { c: 22, oy: -0.4 },
  ],
  68: [
    { c: 68, ox: 0.1, oy: -0.15 }, { c: 67, ox: 0.1, oy: -0.2 },
    { c: 53, ox: -0.6, oy: -0.3 }, { c: 48, ox: -0.5, oy: 0.2 },
    { c: 33, ox: -0.4, oy: -0.3 }, { c: 34, ox: -0.1, oy: -0.25 },
    { c: 35, ox: -0.1, oy: -0.5 }, { c: 36, ox: -0.1, oy: 0.3 },
    { c: 25, ox: 0.1, oy: -0.3 }, { c: 26, ox: -0.1, oy: -0.01 },
    { c: 15, ox: -0.1, oy: 0.05 }, { c: 16, ox: -0.15, oy: 0.45 },
    { c: 17, ox: -0.15, oy: 0.25 }, { c: 18, ox: -0.15, oy: 0.4 },
    { c: 2 },
  ],
};

const SNAKE_THICKNESS: Record<number, number> = { 83: 10, 68: 11 };

const SNAKE_COLORS: Record<number, SnakeColors> = {
  83: { body: "#6b2c2c", outline: "#381010", belly: "#c98f8f", scaleLight: "#8b3a3a", scaleDark: "#4a1c1c", eye: "#d8c25a" },
  68: { body: "#c0392b", outline: "#5a0e08", belly: "#e74c3c", scaleLight: "#e74c3c", scaleDark: "#7a1810", eye: "#f1c40f" },
};

const SNAKE_STYLE_CONFIGS: Record<number, { scaleStride?: number; bulgeProfile?: { t: number; width: number }[] }> = {
  68: {
    scaleStride: 10,
    bulgeProfile: [
      { t: 0.0, width: 0.2 }, { t: 0.1, width: 0.8 }, { t: 0.3, width: 1.4 },
      { t: 0.5, width: 0.6 }, { t: 0.8, width: 1.2 }, { t: 1.0, width: 1.5 },
    ],
  },
};

const SNAKE_RENDER_ORDER: number[] = [83, 68];

const LADDER_OFFSETS: Record<number, { aX: number; bX: number; aY?: number; bY?: number }> = {
  8: { aX: -0.3, aY: -0.3, bX: 0.25, bY: 0.3 },
  19: { aX: 0, bX: -0.15, bY: 0.35 },
  21: { aX: -0.25, bX: 0.05, bY: 0.35 },
  28: { aX: -0.1, bX: 0.15 },
  36: { aX: -0.3, aY: -0.3, bX: 0.2, bY: 0.25 },
  50: { aX: 0.2, bX: 0.2 },
  61: { aX: -0.25, bX: -0.15, bY: 0.35 },
  62: { aX: 0.25, aY: -0.25, bX: -0.3, bY: 0.35 },
};

const SHOW_SNAKE_DEBUG = false;

// ── Main Component ────────────────────────────────────────────────────────────

export default function Board({
  positions = {},
  playerNames = {},
  roomData,
  hideLegend = false,
  diceComplete = false,
  dimensions,
}: BoardProps) {
  const ladderEntries = useMemo(
    () => Object.entries(LADDERS).map(([from, to], i) => ({ from: Number(from), to: Number(to), index: i })),
    []
  );

  const [fallbackDims, setFallbackDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (dimensions && dimensions.width > 0 && dimensions.height > 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setFallbackDims({ w: window.innerWidth, h: window.innerHeight });
      }, 100);
    };

    handler();
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
      clearTimeout(timeoutId);
    };
  }, [dimensions]);

  const { cellSize, borderPadding } = useMemo(() => {
    const w = dimensions?.width || fallbackDims.w || 800;
    const h = dimensions?.height || fallbackDims.h || 800;
    return calculateBoardMetrics(w, h);
  }, [dimensions, fallbackDims]);

  const boardSize = cellSize * 10;
  const prevCellSizeRef = useRef(cellSize);
  const cellSizeRef = useRef(cellSize);
  const isMounted = useRef(true);

  useEffect(() => { cellSizeRef.current = cellSize; }, [cellSize]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const lastMoveKeyRef = useRef<string>("");
  const pendingRoomDataRef = useRef<Room | null>(null);
  const scheduledTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runAnimationRef = useRef<((snap: Room) => void) | null>(null);
  const tokenPixelsRef = useRef<Record<string, TokenState>>({});
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ★ NEW: Stateful tokens now contain x, y, duration, and ease
  const [tokenPixels, setTokenPixels] = useState<Record<string, TokenState>>({});

  useEffect(() => {
    const cellSizeChanged = prevCellSizeRef.current !== cellSize;
    if (cellSizeChanged) {
      prevCellSizeRef.current = cellSize;
    }

    if (scheduledTimeoutsRef.current.length > 0 && !cellSizeChanged) return;

    const next: Record<string, TokenState> = {};
    Object.keys(positions).forEach((pid) => {
      const px = squareToPixel(positions[pid] ?? 1, pid, cellSize);
      // duration 0 on initial sync so the token snaps into place instantly on page load
      next[pid] = { ...px, duration: 0, ease: "linear" };
    });

    tokenPixelsRef.current = next;
    setTokenPixels({ ...next });
  }, [cellSize, positions]);

  runAnimationRef.current = (snap: Room) => {
    const pid = snap.lastRolledBy;
    if (!pid) return;

    const from = snap.lastFrom ?? 1;
    const finalPos = snap.positions?.[pid] ?? from;
    const diceVal = snap.lastDice ?? 0;
    const naturalEnd = Math.min(100, from + diceVal);

    scheduledTimeoutsRef.current.forEach(clearTimeout);
    scheduledTimeoutsRef.current = [];

    const stepDelay = 300;
    const steps = naturalEnd - from;

    // ★ PHASE 1: Standard Dice Movement (1 Square at a Time)
    for (let s = 1; s <= steps; s++) {
      const targetCell = from + s;
      const t = setTimeout(() => {
        const px = squareToPixel(targetCell, pid, cellSizeRef.current);
        tokenPixelsRef.current = { 
          ...tokenPixelsRef.current, 
          // Match CSS transition perfectly to JS delay to prevent stutter
          [pid]: { ...px, duration: stepDelay, ease: "ease-out" } 
        };
        if (isMounted.current) setTokenPixels({ ...tokenPixelsRef.current });
      }, s * stepDelay);
      scheduledTimeoutsRef.current.push(t);
    }

    const stepsDuration = steps * stepDelay;

    // ★ PHASE 2: Snake/Ladder Slide (High frequency JS curve update)
    if (finalPos !== naturalEnd) {
      const isSnake = finalPos < naturalEnd;
      const jumpDelay = stepsDuration + 400;

      const jumpT = setTimeout(() => {
        const aCenter = cellCenter(naturalEnd, cellSizeRef.current);
        const bCenter = cellCenter(finalPos, cellSizeRef.current);
        const offset = getClusterOffset(pid);

        const aPixel = { x: aCenter.x + offset.x, y: aCenter.y + offset.y };
        const bPixel = { x: bCenter.x + offset.x, y: bCenter.y + offset.y };

        const curveSteps = 30;
        const frameDuration = isSnake ? 2000 : 1200;
        const frameDelay = frameDuration / curveSteps;

        let waveDir = 1;
        let curveFactor = 0.15;

        if (isSnake) {
          const snakeIndex = Object.keys(SNAKES).indexOf(String(naturalEnd));
          waveDir = snakeIndex % 2 === 0 ? 1 : -1;
          const style = CLASSIC_SNAKES[naturalEnd];
          if (style) curveFactor = style.curveFactor;
        }

        const curvePoints = isSnake
          ? getPointsAlongCurve(aPixel, bPixel, waveDir, curveSteps, curveFactor)
          : getPointsAlongLine(aPixel, bPixel, curveSteps);

        curvePoints.forEach((pt, i) => {
          const frameT = setTimeout(() => {
            tokenPixelsRef.current = { 
              ...tokenPixelsRef.current, 
              // Set duration to frameDelay and linear so it glides perfectly between 66ms ticks
              [pid]: { ...pt, duration: frameDelay, ease: "linear" } 
            };
            if (isMounted.current) setTokenPixels({ ...tokenPixelsRef.current });
          }, i * frameDelay);
          scheduledTimeoutsRef.current.push(frameT);
        });
      }, jumpDelay);

      scheduledTimeoutsRef.current.push(jumpT);
    }
  };

  useEffect(() => {
    if (!roomData) return;

    const moveKey = String(roomData.moveCount ?? 0);
    if (moveKey === lastMoveKeyRef.current) return;

    pendingRoomDataRef.current = roomData;

    if (roomData.positions) {
      const shouldSnapAll = !roomData.lastDice;
      const next: Record<string, TokenState> = {};

      Object.keys(roomData.positions).forEach((pid) => {
        if (shouldSnapAll || !tokenPixelsRef.current[pid]) {
          const px = squareToPixel(roomData.positions![pid] ?? 1, pid, cellSize);
          next[pid] = { ...px, duration: 0, ease: "linear" }; // Instant snap on load
        }
      });

      if (Object.keys(next).length > 0) {
        tokenPixelsRef.current = { ...tokenPixelsRef.current, ...next };
        setTokenPixels({ ...tokenPixelsRef.current });
      }
    }

    if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);

    observerTimeoutRef.current = setTimeout(() => {
      if (pendingRoomDataRef.current && runAnimationRef.current) {
        const snap = pendingRoomDataRef.current;
        lastMoveKeyRef.current = moveKey;
        pendingRoomDataRef.current = null;
        runAnimationRef.current(snap);
      }
    }, 5000);
  }, [roomData, cellSize]);

  useEffect(() => {
    if (!diceComplete || !pendingRoomDataRef.current) return;

    const snap = pendingRoomDataRef.current;
    const moveKey = String(snap.moveCount ?? 0);
    if (moveKey === lastMoveKeyRef.current) return;

    if (observerTimeoutRef.current) {
      clearTimeout(observerTimeoutRef.current);
      observerTimeoutRef.current = null;
    }

    lastMoveKeyRef.current = moveKey;
    pendingRoomDataRef.current = null;
    runAnimationRef.current?.(snap);
  }, [diceComplete]);

  useEffect(() => {
    return () => {
      scheduledTimeoutsRef.current.forEach(clearTimeout);
      if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
    };
  }, []);

  const playerIds = Object.keys(positions);

  const resolvedSnakes = useMemo(() => {
    return SNAKE_RENDER_ORDER.map((id) => {
      const cellWaypoints = SNAKE_WAYPOINTS[id];
      if (!cellWaypoints || cellWaypoints.length < 2) return null;
      const pixelWaypoints = cellWaypoints.map((wp) => getWaypointCenter(wp, cellSize));
      return {
        id,
        waypoints: pixelWaypoints,
        thickness: SNAKE_THICKNESS[id] ?? 12,
        colors: SNAKE_COLORS[id] ?? SNAKE_COLORS[68],
        styleConfig: SNAKE_STYLE_CONFIGS[id],
      };
    }).filter(Boolean) as {
      id: number;
      waypoints: { x: number; y: number }[];
      thickness: number;
      colors: SnakeColors;
      styleConfig?: { scaleStride?: number; bulgeProfile?: { t: number; width: number }[] };
    }[];
  }, [cellSize]);

  const tokenSize = Math.max(10, Math.min(22, cellSize * 0.38));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          padding: borderPadding,
          background: "linear-gradient(145deg, #F5C800 0%, #D4A600 50%, #F5C800 100%)",
          borderRadius: Math.max(6, borderPadding * 0.7),
          boxShadow: `
            0 16px 48px rgba(0,0,0,0.5),
            0 0 0 1px rgba(245,200,0,0.3),
            0 0 24px rgba(245,200,0,0.08)
          `,
        }}
      >
        <div
          style={{
            position: "relative",
            width: boardSize,
            height: boardSize,
            borderRadius: 4,
            background: "#FFF",
            boxShadow: "inset 0 0 10px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.08)",
            outline: `${Math.max(2, Math.round(cellSize * 0.04))}px solid #5C2A00`,
            outlineOffset: `-${Math.max(1, Math.round(cellSize * 0.02))}px`,
            overflow: "hidden",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
          }}
        >
          {/* Cells */}
          {Array.from({ length: 100 }, (_, i) => {
            const num = i + 1;
            const { row, col } = cellToPos(num);
            return (
              <div
                key={num}
                style={{
                  position: "absolute",
                  left: col * cellSize,
                  top: row * cellSize,
                  width: cellSize,
                  height: cellSize,
                  background: getCellColor(num),
                  border: "1px solid rgba(0,0,0,0.35)",
                  boxShadow: "inset 0 0 0.5px rgba(0,0,0,0.2)",
                  boxSizing: "border-box",
                }}
              />
            );
          })}

          {/* Paper grain */}
          <svg
            style={{
              position: "absolute", top: 0, left: 0,
              width: boardSize, height: boardSize,
              pointerEvents: "none", zIndex: 1,
              opacity: 0.12, mixBlendMode: "multiply",
            }}
          >
            <defs>
              <filter id="paperGrain">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise" />
                <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
              </filter>
            </defs>
            <rect width="100%" height="100%" filter="url(#paperGrain)" />
          </svg>

          {/* Light vignette */}
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: boardSize, height: boardSize,
              pointerEvents: "none", zIndex: 2,
              background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.10) 100%)",
            }}
          />

          {/* Wear corners */}
          <svg
            style={{
              position: "absolute", top: 0, left: 0,
              width: boardSize, height: boardSize,
              pointerEvents: "none", zIndex: 3,
            }}
          >
            <defs>
              <filter id="wearBlur">
                <feGaussianBlur stdDeviation={cellSize * 0.3} />
              </filter>
            </defs>
            {[[0,0],[1,0],[0,1],[1,1]].map(([cx, cy], i) => (
              <ellipse
                key={i}
                cx={cx * boardSize}
                cy={cy * boardSize}
                rx={cellSize * 1.4}
                ry={cellSize * 1.4}
                fill="rgba(60,40,20,0.10)"
                filter="url(#wearBlur)"
              />
            ))}
          </svg>

          {/* Main SVG (Snakes + Ladders + Home) */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 5 }}
            width={boardSize}
            height={boardSize}
          >
            {/* Snakes */}
            {resolvedSnakes.map((s) => (
              <Snake
                key={`snake-${s.id}`}
                id={s.id}
                waypoints={s.waypoints}
                thickness={s.thickness}
                colors={s.colors}
                styleConfig={s.styleConfig}
              />
            ))}

            {SHOW_SNAKE_DEBUG &&
              resolvedSnakes.map((s) => (
                <g key={`debug-${s.id}`} opacity={0.95}>
                  <polyline
                    points={s.waypoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={s.id === 83 ? "#ff4d4d" : "#00e5ff"}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  {s.waypoints.map((p, i) => (
                    <g key={`debug-${s.id}-wp-${i}`}>
                      <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#111" strokeWidth={1.5} />
                      <text x={p.x + 6} y={p.y - 6} fontSize={11} fontWeight={700} fill="#111" stroke="#fff" strokeWidth={2} paintOrder="stroke">
                        {s.id}:{i}
                      </text>
                    </g>
                  ))}
                </g>
              ))}

            {/* Ladders */}
            {ladderEntries.map(({ from, to }) => {
              const aCenter = cellCenter(from, cellSize);
              const bCenter = cellCenter(to, cellSize);

              const offset = LADDER_OFFSETS[from] || { aX: 0, bX: 0 };
              const a = { x: aCenter.x + offset.aX * cellSize, y: aCenter.y + (offset.aY ?? -0.4) * cellSize };
              const b = { x: bCenter.x + offset.bX * cellSize, y: bCenter.y + (offset.bY ?? 0.45) * cellSize };

              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const nx = -dy / dist;
              const ny = dx / dist;

              const W = 20;
              const r1a = { x: a.x + (nx * W) / 2, y: a.y + (ny * W) / 2 };
              const r1b = { x: b.x + (nx * W) / 2, y: b.y + (ny * W) / 2 };
              const r2a = { x: a.x - (nx * W) / 2, y: a.y - (ny * W) / 2 };
              const r2b = { x: b.x - (nx * W) / 2, y: b.y - (ny * W) / 2 };
              const rungsCount = Math.floor(dist / 18);

              return (
                <g key={`l-${from}`}>
                  <line x1={r1a.x+3} y1={r1a.y+4} x2={r1b.x+3} y2={r1b.y+4} stroke="rgba(0,0,0,0.4)" strokeWidth="8" strokeLinecap="round" />
                  <line x1={r2a.x+3} y1={r2a.y+4} x2={r2b.x+3} y2={r2b.y+4} stroke="rgba(0,0,0,0.4)" strokeWidth="8" strokeLinecap="round" />
                  <line x1={r1a.x} y1={r1a.y} x2={r1b.x} y2={r1b.y} stroke="#8B5328" strokeWidth="8" strokeLinecap="round" />
                  <line x1={r1a.x-1.5} y1={r1a.y-1.5} x2={r1b.x-1.5} y2={r1b.y-1.5} stroke="#E8C488" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
                  <line x1={r2a.x} y1={r2a.y} x2={r2b.x} y2={r2b.y} stroke="#8B5328" strokeWidth="8" strokeLinecap="round" />
                  <line x1={r2a.x-1.5} y1={r2a.y-1.5} x2={r2b.x-1.5} y2={r2b.y-1.5} stroke="#E8C488" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
                  <line x1={r1a.x} y1={r1a.y} x2={r1b.x} y2={r1b.y} stroke="#C48B58" strokeWidth="2" strokeDasharray="10 8" opacity="0.7" />
                  <line x1={r2a.x} y1={r2a.y} x2={r2b.x} y2={r2b.y} stroke="#C48B58" strokeWidth="2" strokeDasharray="10 8" opacity="0.7" />
                  {Array.from({ length: rungsCount }, (_, i) => {
                    const t = (i + 1) / (rungsCount + 1);
                    const rx = a.x + dx * t;
                    const ry = a.y + dy * t;
                    const rung1 = { x: rx + nx * (W / 2 + 1), y: ry + ny * (W / 2 + 1) };
                    const rung2 = { x: rx - nx * (W / 2 + 1), y: ry - ny * (W / 2 + 1) };
                    return (
                      <g key={`rung-${from}-${i}`}>
                        <line x1={rung1.x+1} y1={rung1.y+2} x2={rung2.x+1} y2={rung2.y+2} stroke="rgba(0,0,0,0.4)" strokeWidth="6" />
                        <line x1={rung1.x} y1={rung1.y} x2={rung2.x} y2={rung2.y} stroke="#A66A38" strokeWidth="6" strokeLinecap="round" />
                        <line x1={rung1.x} y1={rung1.y-1} x2={rung2.x} y2={rung2.y-1} stroke="#E8C488" strokeWidth="1.5" opacity="0.8" />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Home icon at 100 */}
            {(() => {
              const center = cellCenter(100, cellSize);
              const w = cellSize * 0.55;
              const h = cellSize * 0.55;
              const x = center.x;
              const y = center.y - cellSize * 0.08;
              return (
                <g transform={`translate(${x}, ${y})`}>
                  <path
                    d={`M ${-w/2},${h/4} L 0,${-h/2} L ${w/2},${h/4} L ${w*0.4},${h/4} L ${w*0.4},${h/2} L ${-w*0.4},${h/2} Z`}
                    fill="rgba(0,0,0,0.4)" transform="translate(3, 4)"
                  />
                  <rect x={-w*0.35} y={0} width={w*0.7} height={h*0.5} fill="#E8C488" stroke="#8B5328" strokeWidth="4" strokeLinejoin="round" />
                  <path
                    d={`M ${-w*0.12},${h*0.5} L ${-w*0.12},${h*0.2} A ${w*0.12} ${w*0.12} 0 0 1 ${w*0.12},${h*0.2} L ${w*0.12},${h*0.5} Z`}
                    fill="#8B5328"
                  />
                  <polygon points={`${-w*0.55},0 0,${-h*0.55} ${w*0.55},0`} fill="#c0392b" stroke="#5a0e08" strokeWidth="4" strokeLinejoin="round" />
                  <polygon points={`${-w*0.4},0 0,${-h*0.4} ${w*0.4},0`} fill="#e74c3c" />
                  <circle cx="0" cy={-h*0.15} r={w*0.1} fill="#F5C800" stroke="#5a0e08" strokeWidth="2" />
                </g>
              );
            })()}
          </svg>

          {/* Numbers overlay */}
          <svg
            style={{
              position: "absolute", top: 0, left: 0,
              pointerEvents: "none", zIndex: 15,
              mixBlendMode: "multiply",
            }}
            width={boardSize}
            height={boardSize}
          >
            <defs>
              <filter id="stampEmboss" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="1" stdDeviation="0.6" floodColor="#ffffff" floodOpacity="0.5" />
                <feDropShadow dx="0" dy="-1" stdDeviation="0.6" floodColor="#000000" floodOpacity="0.5" />
              </filter>
              <filter id="softWhiteBorder" x="-50%" y="-50%" width="200%" height="200%">
                <feMorphology operator="dilate" radius="0.6" in="SourceAlpha" result="dilated" />
                <feGaussianBlur in="dilated" stdDeviation="0.5" result="blurred" />
                <feFlood floodColor="#ffffff" floodOpacity="0.85" result="white" />
                <feComposite in="white" in2="blurred" operator="in" result="whiteBorder" />
                <feMerge>
                  <feMergeNode in="whiteBorder" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {Array.from({ length: 100 }, (_, i) => {
              const num = i + 1;
              const { row, col } = cellToPos(num);
              const isHome = num === 100;
              const isStart = num === 1;
              const fontSize = isHome ? cellSize * 0.16 : isStart ? cellSize * 0.22 : cellSize * 0.4;
              let yOffset = 0;
              if (isHome) yOffset = cellSize * 0.35;
              if (num === 83 || num === 94 || num === 97 || num === 98) yOffset = -cellSize * 0.25;

              return (
                <g key={num} filter="url(#softWhiteBorder)">
                  <text
                    x={col * cellSize + cellSize / 2}
                    y={row * cellSize + cellSize / 2 + yOffset}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fontWeight="900"
                    fontFamily="'Arial Black', Impact, sans-serif"
                    fill={isHome || isStart ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.78)"}
                    filter="url(#stampEmboss)"
                    style={{ userSelect: "none" }}
                  >
                    {isStart ? "START" : isHome ? "HOME" : num}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Tokens - ★ PERFORMANCE FIX: hardware acceleration + dynamic transition durations */}
          {playerIds.map((pid) => {
            const px = tokenPixels[pid];
            if (!px) return null;

            return (
              <div
                key={pid}
                style={{
                  position: "absolute",
                  width: tokenSize,
                  height: tokenSize,
                  borderRadius: "50%",
                  background: roomData?.playerColors?.[pid] || getPlayerColor(pid),
                  border: `${Math.max(1.5, tokenSize * 0.1)}px solid #fff`,
                  boxShadow: `0 2px 6px rgba(0,0,0,0.6), 0 0 ${tokenSize * 0.4}px rgba(0,0,0,0.2)`,
                  top: 0,
                  left: 0,
                  transform: `translate3d(calc(${px.x}px - 50%), calc(${px.y}px - 50%), 0)`,
                  transition: `transform ${px.duration}ms ${px.ease}`,
                  willChange: "transform",
                  zIndex: 20,
                  pointerEvents: "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              />
            );
          })}
        </div>
      </div>

      {!hideLegend && playerIds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20, justifyContent: "center" }}>
          {playerIds.map((pid) => (
            <div
              key={`legend-${pid}`}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--bg-tertiary)", borderRadius: 24,
                padding: "6px 14px", fontSize: 14, fontWeight: 600,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: roomData?.playerColors?.[pid] || getPlayerColor(pid) }} />
              {playerNames[pid] || pid}
              <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 4 }}>
                (Pos: {positions[pid] ?? 1})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}