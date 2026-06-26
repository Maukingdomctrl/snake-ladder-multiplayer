// src/components/Board.tsx

import React, { useMemo, useEffect, useRef, useState, useCallback, memo } from "react";
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

// BUG FIX: CLUSTER_OFFSETS in constants.ts stores FRACTIONS of a cell (e.g.
// 0.12 means "12% of one cell's width/height"), exactly as documented by
// constants.ts's own getScaledClusterOffset helper, which multiplies by
// cellSize before returning. This local getClusterOffset was returning the
// raw fractional value directly, which callers then added straight into a
// pixel calculation — e.g. `col * cellSize + cellSize / 2 + offset.x` where
// offset.x was ~0.12 instead of ~0.12 * cellSize. On a typical 50-80px
// cell, that's a sub-pixel nudge instead of the intended 6-10px separation,
// so stacked tokens rendered essentially on top of each other regardless
// of CLUSTER_OFFSETS. Now takes cellSize and scales correctly.
function getClusterOffset(pid: string, cellSize: number) {
  const offset = CLUSTER_OFFSETS[getPidHash(pid) % CLUSTER_OFFSETS.length];
  return { x: offset.x * cellSize, y: offset.y * cellSize };
}

function squareToPixel(squareNum: number, pid: string, cellSize: number) {
  const { row, col } = cellToPos(squareNum);
  const offset = getClusterOffset(pid, cellSize);
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

function getPointsAlongLine(from: { x: number; y: number }, to: { x: number; y: number }, steps: number) {
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
      x: mt * mt * mt * a.x + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * b.x,
      y: mt * mt * mt * a.y + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * b.y,
    });
  }
  return points;
}

// ── Types & Constants ─────────────────────────────────────────────────────────

interface BoardProps {
  positions?: Record<string, number>;
  playerNames?: Record<string, string>;
  roomData?: Room | null;
  hideLegend?: boolean;
  diceComplete?: boolean;
  dimensions?: { width: number; height: number };
}

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

// ── Static Board Graphics Layer (Frozen via React.memo) ───────────────────────

interface StaticBoardProps {
  cellSize: number;
  boardSize: number;
}

const StaticBoardGraphics = memo(({ cellSize, boardSize }: StaticBoardProps) => {
  const ladderEntries = useMemo(
    () => Object.entries(LADDERS).map(([from, to], i) => ({ from: Number(from), to: Number(to), index: i })),
    []
  );

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
    }).filter(Boolean) as any[];
  }, [cellSize]);

  return (
    <>
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
                points={s.waypoints.map((p: any) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={s.id === 83 ? "#ff4d4d" : "#00e5ff"}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              {s.waypoints.map((p: any, i: number) => (
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
    </>
  );
});

// ── Dynamic Token Layer (Async Engine) ────────────────────────────────────────
//
// This layer previously used a manual task-queue with a boolean
// `cancelQueueRef` flag to interrupt in-flight animations when a new move
// arrived. That design had a race condition: the flag gets reset to `false`
// as part of *starting* the new move, but the *old* animation's in-flight
// `await delay(...)` can still be sleeping at that exact moment. When it
// wakes up it reads the now-reset flag, assumes it was never cancelled, and
// keeps draining the queue — except the queue now contains the *new* move's
// steps. That's what produced the skips/reversals: two animations were
// effectively interleaved on the same token.
//
// Fix: replace the boolean flag with a monotonically increasing "generation"
// counter. Every new move increments it and captures its own value. Every
// step of the async animation checks "is my generation still current?"
// before touching the DOM or continuing — if not, it simply stops, no
// matter when it wakes up relative to a newer move starting. This makes
// stale animations self-terminating instead of relying on a shared flag
// that can be reset out from under them. We also force-snap the token to
// its true starting square before each move begins, so even a worst-case
// interruption never leaves the token starting from the wrong spot.

interface TokenLayerProps {
  playerIds: string[];
  positions: Record<string, number>;
  roomData?: Room | null;
  cellSize: number;
  diceComplete: boolean;
  tokenSize: number;
}

const TokenLayer = ({ playerIds, positions, roomData, cellSize, diceComplete, tokenSize }: TokenLayerProps) => {
  const tokenRefs = useRef<Record<string, HTMLDivElement>>({});
  const lastMoveKeyRef = useRef<string>("");
  // PATCH: anchor token movement to a fixed wall-clock floor measured from
  // when this move was FIRST observed, not just to diceComplete flipping
  // true. If diceComplete ever turns true earlier than the dice's actual
  // ~5s visual roll (e.g. a fast round-trip, or any upstream timing drift
  // in Dice.tsx/App.tsx we haven't fully closed), this still guarantees
  // the token never starts walking before the roll has had this minimum
  // amount of time to visually finish.
  const moveSeenAtRef = useRef<number>(0);
  const ROLL_MIN_DURATION_MS = 5000;

  // Tracks which player currently "owns" an in-flight animation, so the
  // position-sync effect below doesn't snap them mid-animation.
  const animatingPlayerRef = useRef<string | null>(null);

  // Bumped every time a new move begins. Any async animation loop captures
  // the value at its start and compares against the live ref on every step;
  // if they no longer match, that loop is stale and stops itself.
  const moveGenRef = useRef(0);

  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const halfToken = tokenSize / 2;
  const halfTokenRef = useRef(halfToken);

  useEffect(() => {
    halfTokenRef.current = halfToken;
  }, [halfToken]);

  // BUG FIX (animation breaks when a snake/ladder popup appears):
  // The move effect's async IIFE closes over `cellSize` as it was at the
  // moment the move started. If a snake/ladder result causes the parent to
  // mount a popup/modal that changes the board's available layout space
  // (e.g. shrinking it to make room for the popup), `Board`'s `cellSize`
  // memo recomputes and `TokenLayer` re-renders with a NEW `cellSize` — but
  // the in-flight animation loop keeps computing pixel targets from the
  // OLD `cellSize` it captured at start. Meanwhile the `snapToken` effect
  // (which runs on every `cellSize` change) uses the NEW `cellSize` for any
  // non-animating token. Two different scales being used for the same
  // token at the same time is exactly what breaks/jumps the animation when
  // a popup opens.
  //
  // Fix: keep a ref that always holds the latest `cellSize`, and have the
  // animation loop read from the ref on every step instead of the value it
  // captured when the move started. This guarantees the in-flight
  // animation always targets the current layout, even if it changes
  // mid-flight.
  const cellSizeRef = useRef(cellSize);
  useEffect(() => {
    cellSizeRef.current = cellSize;
  }, [cellSize]);

  useEffect(() => {
    return () => {
      // Invalidate any animation still running when this component unmounts.
      moveGenRef.current++;
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    };
  }, []);

  const snapToken = useCallback((pid: string, cell: number) => {
    const el = tokenRefs.current[pid];
    if (!el) return;
    const px = squareToPixel(cell, pid, cellSizeRef.current);
    el.style.transition = "none";
    el.style.transform = `translate3d(${px.x - halfTokenRef.current}px, ${px.y - halfTokenRef.current}px, 0)`;
  }, []);

  // Keep every non-animating player's token glued to its authoritative
  // position (e.g. on resize, or when another player's positions update).
  useEffect(() => {
    playerIds.forEach((pid) => {
      if (pid === animatingPlayerRef.current) return;
      snapToken(pid, positions[pid] ?? 1);
    });
  }, [cellSize, positions, playerIds, snapToken]);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  useEffect(() => {
    if (!roomData) return;

    const moveKey = String(roomData.moveCount ?? 0);
    const isInitialLoad = lastMoveKeyRef.current === "";
    const isNewMoveKey = moveKey !== lastMoveKeyRef.current;

    // Stamp the very first time we see this moveKey, BEFORE the
    // diceComplete gate below — this is what lets us measure "time since
    // roll started" instead of just reacting to diceComplete.
    if (isNewMoveKey && moveSeenAtRef.current === 0) {
      moveSeenAtRef.current = Date.now();
    }

    if (moveKey === lastMoveKeyRef.current) return;
    if (!isInitialLoad && !diceComplete) return;

    // Compute elapsed time since this move was FIRST observed (which may
    // have been several effect re-runs ago, while waiting on
    // diceComplete). This is what the 5s floor is measured against.
    const elapsedSinceMoveSeen = moveSeenAtRef.current
      ? Date.now() - moveSeenAtRef.current
      : 0;
    moveSeenAtRef.current = 0; // reset so the next move gets its own stamp

    lastMoveKeyRef.current = moveKey;

    const pid = roomData.lastRolledBy;
    if (!pid) return;

    // Skip animation entirely on initial load — let the snapToken effect
    // above place everyone instantly.
    if (isInitialLoad) {
      animatingPlayerRef.current = null;
      return;
    }

    // New move: claim a fresh generation. Whatever animation was running
    // for a previous move (for this player or otherwise) will notice the
    // mismatch the next time it checks and stop itself.
    const myGen = ++moveGenRef.current;
    const isStale = () => moveGenRef.current !== myGen;

    animatingPlayerRef.current = pid;

    const from = roomData.lastFrom ?? 1;
    const finalPos = roomData.positions?.[pid] ?? from;
    const diceVal = roomData.lastDice ?? 0;
    const naturalEnd = Math.min(100, from + diceVal);

    // Safety net: if something goes wrong and this move never completes,
    // force a clean snap to the final position so the token never gets
    // stuck mid-board. Budget generously: up to 5000ms floor wait + 2000ms
    // pre-pause + up to 6 squares at ~870ms worst-case each (350ms
    // transition + 400ms hold + fallback margin) + the snake/ladder slide
    // (~1400ms) ≈ 14000ms total, so 17000ms leaves comfortable headroom
    // without false-triggering.
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    safetyTimeoutRef.current = setTimeout(() => {
      if (!isStale() && animatingPlayerRef.current === pid) {
        animatingPlayerRef.current = null;
        snapToken(pid, finalPos);
      }
    }, 17000);

    (async () => {
      // PATCH: hold here until at least ROLL_MIN_DURATION_MS (5000ms) has
      // passed since this move was first observed — regardless of how
      // quickly diceComplete flipped true. This is the fix for "pieces
      // still move before the dice visually stops": diceComplete alone
      // was being trusted as "the dice finished," but if it ever fires
      // early relative to the dice's real ~5s spin, nothing previously
      // stopped the token from starting anyway. This wait is independent
      // of and in addition to every other timing fix already in place.
      const remainingFloor = Math.max(0, ROLL_MIN_DURATION_MS - elapsedSinceMoveSeen);
      if (remainingFloor > 0) {
        await delay(remainingFloor);
        if (isStale()) return;
      }

      // Small delay so React has committed and the dice's visual settle
      // (including its glow/scale keyframe) has unmistakably finished
      // before the token starts moving. Paired with the Dice.tsx settle
      // buffer and App.tsx's fallback-timeout margin, this closes the gap
      // that let tokens appear to move while the dice was still visibly
      // settling.
      await delay(150);
      if (isStale()) return;

      // Force the token to its true starting square before animating.
      // This guarantees the walk always starts from the right place, even
      // if a prior animation was interrupted before reaching its target.
      snapToken(pid, from);

      // 1. INTENTIONAL PRE-MOVE PAUSE (2000ms)
      // Gives players a moment to see the dice result before the token
      // starts walking, so the motion reads as deliberate rather than rushed.
      if (diceVal > 0) {
        await delay(2000);
        if (isStale()) return;
      }

      // 2. STACCATO MOVEMENT (1..2..3..4) — one square at a time.
      //
      // Previously this used a fixed `await delay(750)` per square, assuming
      // the 350ms CSS transition would always finish well within that
      // window. On a slower device/browser (frame drops, GC pause, a
      // background tab catching up), the transition can still be mid-flight
      // when the loop's timer fires anyway. Setting a *new* transform target
      // while the browser is still interpolating toward the previous one
      // makes the token visually overshoot, snap back, or stutter — which
      // reads exactly like "goes forward then comes back."
      //
      // Fix: wait for the browser's own `transitionend` event before
      // advancing to the next square, instead of guessing at a delay. A
      // short fallback timeout covers the rare case where the event doesn't
      // fire (e.g. the element was already at that exact pixel position, in
      // which case no transition runs at all). A forced reflow
      // (`el.offsetHeight`) between setting `transition` and setting
      // `transform` guarantees the browser treats them as two separate
      // commits and can't coalesce/skip a step under load.
      const waitForStep = (el: HTMLDivElement, durationMs: number) =>
        new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            el.removeEventListener("transitionend", onEnd);
            resolve();
          };
          const onEnd = (e: TransitionEvent) => {
            if (e.propertyName === "transform") finish();
          };
          el.addEventListener("transitionend", onEnd);
          // Fallback in case transitionend never fires (e.g. start === end).
          setTimeout(finish, durationMs + 120);
        });

      const STEP_DURATION = 350; // ms, ease-out drop into each square
      const STEP_HOLD = 400;     // ms, pause after landing before the next hop

      for (let i = from + 1; i <= naturalEnd; i++) {
        if (isStale()) return;
        const el = tokenRefs.current[pid];
        if (!el) return;

        const px = squareToPixel(i, pid, cellSizeRef.current);

        // Set transition first, force a reflow, THEN set transform. This
        // prevents the browser from batching the two writes into a single
        // commit (which is what allows a step to be silently skipped).
        el.style.transition = `transform ${STEP_DURATION}ms ease-out`;
        void el.offsetHeight; // force reflow / commit the transition change
        el.style.transform = `translate3d(${px.x - halfTokenRef.current}px, ${px.y - halfTokenRef.current}px, 0)`;

        await waitForStep(el, STEP_DURATION);
        if (isStale()) return;

        // Deliberate hold after landing on the square before hopping again.
        await delay(STEP_HOLD);
        if (isStale()) return;
      }

      // 3. SNAKE/LADDER PATH INTERPOLATION
      // Only trigger when the player actually landed on a snake/ladder head
      // (finalPos differs from both the natural roll-end and the start —
      // this guards against a false "snake" on an exact-roll overshoot).
      if (finalPos !== naturalEnd && finalPos !== from) {
        const jumpEl = tokenRefs.current[pid];
        if (jumpEl) {
          // Use the CURRENT cellSize, not whatever was captured when the
          // move started — if a popup opened during the staccato phase and
          // shrank/grew the board, this phase must still land the token in
          // the right place on the present-day layout.
          const liveCellSize = cellSizeRef.current;
          const isSnake = finalPos < naturalEnd;
          const aCenter = cellCenter(naturalEnd, liveCellSize);
          const bCenter = cellCenter(finalPos, liveCellSize);
          const offset = getClusterOffset(pid, liveCellSize);
          const aPixel = { x: aCenter.x + offset.x, y: aCenter.y + offset.y };
          const bPixel = { x: bCenter.x + offset.x, y: bCenter.y + offset.y };

          const steps = 40;
          let waveDir = 1;
          let curveFactor = 0.15;
          if (isSnake) {
            const snakeIndex = Object.keys(SNAKES).indexOf(String(naturalEnd));
            waveDir = snakeIndex % 2 === 0 ? 1 : -1;
            const style = CLASSIC_SNAKES[naturalEnd];
            if (style) curveFactor = style.curveFactor;
          }

          const points = isSnake
            ? getPointsAlongCurve(aPixel, bPixel, waveDir, steps, curveFactor)
            : getPointsAlongLine(aPixel, bPixel, steps);

          // Slower slide speed for snakes than ladders
          const frameDelay = isSnake ? 35 : 30;

          for (let i = 0; i <= steps; i++) {
            if (isStale()) return;
            const pt = points[i];
            jumpEl.style.transition = `transform ${frameDelay}ms linear`;
            jumpEl.style.transform = `translate3d(${pt.x - halfTokenRef.current}px, ${pt.y - halfTokenRef.current}px, 0)`;
            await delay(frameDelay);
          }
        }
      }

      // Move finished cleanly — release the lock and clear the safety net.
      if (!isStale() && animatingPlayerRef.current === pid) {
        animatingPlayerRef.current = null;
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
      }
    })();
    // Note: `cellSize` is intentionally NOT a dependency here. The
    // animation reads the always-current value via `cellSizeRef.current`,
    // so this effect only needs to re-run when an actual new move arrives
    // (`roomData`/`diceComplete`), not whenever the board's layout changes
    // (e.g. because a snake/ladder popup resized the available space).
    // Re-running this effect on every layout change would be at best
    // wasteful and at worst risk interrupting an in-flight move for a
    // reason that has nothing to do with the move itself.
  }, [diceComplete, roomData, snapToken]);

  // IMPORTANT: `transform` and `transition` must never appear in the React
  // `style={{...}}` object below. If they do, every re-render of TokenLayer
  // (which happens whenever `positions` changes — e.g. exactly when a move
  // lands and the parent pushes the new DB position down) causes React to
  // recompute those two properties from current props and reassign them via
  // the DOM `style` API, stomping whatever the imperative async engine just
  // set a moment earlier.
  //
  // The ref below is an inline arrow function, which means it is a *new*
  // function identity on every render. React identity-compares the `ref`
  // prop like any other prop, so on every render it detaches (calls the old
  // ref with `null`) and reattaches (calls the new ref with the element) —
  // it does NOT only fire on mount/unmount. A naive "seed once" check (e.g.
  // an in-memory flag, or checking whether `el.style.transform` is already
  // set) would therefore re-run on every render too, stomping the
  // imperative engine right back.
  //
  // The fix: stamp a flag directly onto the DOM node via `dataset`. That
  // flag is a property of the actual element, not of React's render cycle
  // or this closure, so it survives any number of detach/reattach cycles
  // and guarantees the seed logic runs exactly once per node's lifetime —
  // regardless of how many times TokenLayer re-renders.
  //
  // After that one-time seed, only `snapToken` (on resize/position changes
  // while not animating) and the async move engine (via moveGenRef) ever
  // write `el.style.transform` / `el.style.transition` again. React never
  // touches them for the lifetime of the node.
  return (
    <>
      {playerIds.map((pid) => (
        <div
          key={pid}
          ref={(el) => {
            if (el) {
              tokenRefs.current[pid] = el;

              // Dataset flag lives on the DOM node itself — immune to the
              // inline ref function being re-created (and thus re-invoked)
              // on every render.
              if (!el.dataset.seeded) {
                const initialCell = positions[pid] ?? 1;
                const px = squareToPixel(initialCell, pid, cellSize);
                el.style.transition = "none";
                el.style.transform = `translate3d(${px.x - halfTokenRef.current}px, ${px.y - halfTokenRef.current}px, 0)`;
                el.dataset.seeded = "true";
              }
            } else {
              delete tokenRefs.current[pid];
            }
          }}
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
            willChange: "transform",
            zIndex: 20,
            pointerEvents: "none",
            // transform/transition intentionally omitted — see note above.
          }}
        />
      ))}
    </>
  );
};

// ── Main Container ────────────────────────────────────────────────────────────

export default function Board({
  positions = {},
  playerNames = {},
  roomData,
  hideLegend = false,
  diceComplete = false,
  dimensions,
}: BoardProps) {

  // BUG FIX (board "zooms in" on load then snaps to normal size):
  // The previous initial state defaulted to `window.innerWidth/innerHeight`
  // — the entire viewport — as a fallback before any real measurement was
  // available. If the parent measures its actual container size via
  // useRef/ResizeObserver (common pattern), there's a render or two before
  // `dimensions` is populated. During that window, cellSize was being
  // computed from the *full browser viewport* instead of the actual board
  // container, producing a way-oversized board that then visibly snapped
  // down to the correct size the instant real `dimensions` arrived — i.e.
  // exactly the "zooms in then returns to normal" symptom.
  //
  // Fix: don't fabricate a viewport-sized fallback at all. Track whether we
  // have ANY real measurement yet (from `dimensions` or from our own
  // ResizeObserver against the actual wrapper element) and don't compute a
  // board size — render nothing visually sized yet — until we do. This
  // trades "board renders one frame later" for "board never renders at the
  // wrong size," which is the correct trade for this visual symptom.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [measuredDims, setMeasuredDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    // If the parent already supplies real dimensions, we don't need our own
    // ResizeObserver fallback.
    if (dimensions && dimensions.width > 0 && dimensions.height > 0) return;
    const node = wrapperRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setMeasuredDims({ w: width, h: height });
      }
    });
    observer.observe(node);

    // Seed an immediate measurement too, in case ResizeObserver's first
    // callback is delayed by a frame.
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setMeasuredDims({ w: rect.width, h: rect.height });
    }

    return () => observer.disconnect();
  }, [dimensions]);

  const effectiveDims = useMemo(() => {
    if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
      return { w: dimensions.width, h: dimensions.height };
    }
    return measuredDims;
  }, [dimensions, measuredDims]);

  const metrics = useMemo(() => {
    if (!effectiveDims) return null;
    return calculateBoardMetrics(effectiveDims.w, effectiveDims.h);
  }, [effectiveDims]);

  const cellSize = metrics?.cellSize ?? 0;
  const borderPadding = metrics?.borderPadding ?? 0;

  const boardSize = cellSize * 10;
  const playerIds = useMemo(() => Object.keys(positions), [positions]);
  const tokenSize = Math.max(10, Math.min(22, cellSize * 0.38));
  const hasMeasurement = metrics !== null;

  return (
    <div
      ref={wrapperRef}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "inherit", width: "100%", height: "100%" }}
    >
      {hasMeasurement && (
        <div style={{
            padding: borderPadding,
            background: "linear-gradient(145deg, #F5C800 0%, #D4A600 50%, #F5C800 100%)",
            borderRadius: Math.max(6, borderPadding * 0.7),
            boxShadow: `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(245,200,0,0.3), 0 0 24px rgba(245,200,0,0.08)`,
        }}>
          <div style={{
              position: "relative", width: boardSize, height: boardSize, borderRadius: 4, background: "#FFF",
              boxShadow: "inset 0 0 10px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.08)",
              outline: `${Math.max(2, Math.round(cellSize * 0.04))}px solid #5C2A00`,
              outlineOffset: `-${Math.max(1, Math.round(cellSize * 0.02))}px`,
              overflow: "hidden", userSelect: "none", WebkitUserSelect: "none", touchAction: "none",
          }}>
            {/* Static rendering - completely locked */}
            <StaticBoardGraphics cellSize={cellSize} boardSize={boardSize} />

            {/* Dynamic token rendering - async engine */}
            <TokenLayer
              playerIds={playerIds} positions={positions} roomData={roomData}
              cellSize={cellSize} diceComplete={diceComplete} tokenSize={tokenSize}
            />
          </div>
        </div>
      )}

      {!hideLegend && hasMeasurement && playerIds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20, justifyContent: "center" }}>
          {playerIds.map((pid) => (
            <div key={`legend-${pid}`} style={{
                display: "flex", alignItems: "center", gap: 8, background: "var(--bg-tertiary)",
                borderRadius: 24, padding: "6px 14px", fontSize: 14, fontWeight: 600, border: "1px solid var(--border)",
            }}>
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