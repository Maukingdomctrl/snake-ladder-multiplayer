import { useMemo, useEffect, useRef, useState } from "react";
import {
  SNAKES,
  LADDERS,
  PLAYER_COLORS,
  CELL_COLORS,
  SNAKE_STYLES,
  CLUSTER_OFFSETS,
} from "../constants";
import type { Room } from "../firebase/rooms";

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getCellColor(num: number) {
  return CELL_COLORS[(num - 1) % CELL_COLORS.length];
}

function cellToPos(num: number) {
  const rowFromBottom = Math.floor((num - 1) / 10);
  const row = 9 - rowFromBottom;
  const col =
    rowFromBottom % 2 === 0 ? (num - 1) % 10 : 9 - ((num - 1) % 10);
  return { row, col };
}

function cellCenter(num: number, cellSize: number) {
  const { row, col } = cellToPos(num);
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
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

function calculateCellSize() {
  const availableWidth =
    window.innerWidth >= 768
      ? Math.min(window.innerWidth - 340, 800)
      : window.innerWidth - 48;

  const availableHeight =
    window.innerWidth >= 768
      ? window.innerHeight - 320
      : window.innerHeight - 200;

  const maxBoardSize = Math.min(availableWidth, availableHeight);
  const finalBoardSize = Math.max(300, Math.min(maxBoardSize, 800));
  return Math.floor(finalBoardSize / 10);
}

// ── Animation path helpers ────────────────────────────────────────────────────

function getPointsAlongLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
  }
  return points;
}

function getPointsAlongCurve(
  a: { x: number; y: number },
  b: { x: number; y: number },
  waveDir: number,
  steps: number
): { x: number; y: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / dist;
  const ny = dx / dist;
  const offset = dist * 0.25 * waveDir;
  const cp1x = a.x + dx * 0.33 + nx * offset;
  const cp1y = a.y + dy * 0.33 + ny * offset;
  const cp2x = a.x + dx * 0.66 - nx * offset;
  const cp2y = a.y + dy * 0.66 - ny * offset;

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoardProps {
  positions?: Record<string, number>;
  playerNames?: Record<string, string>;
  roomData?: Room | null;
  hideLegend?: boolean;
  diceComplete?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Board({
  positions = {},
  playerNames = {},
  roomData,
  hideLegend = false,
  diceComplete = false,
}: BoardProps) {
  const snakeEntries = useMemo(
    () =>
      Object.entries(SNAKES).map(([from, to], i) => ({
        from: Number(from),
        to: Number(to),
        index: i,
      })),
    []
  );

  const ladderEntries = useMemo(
    () =>
      Object.entries(LADDERS).map(([from, to], i) => ({
        from: Number(from),
        to: Number(to),
        index: i,
      })),
    []
  );

  const [cellSize, setCellSize] = useState(() => calculateCellSize());
  const boardSize = cellSize * 10;
  const prevCellSizeRef = useRef(cellSize);

  // ── Animation refs ────────────────────────────────────────────────────────
  const lastMoveKeyRef = useRef<string>("");
  const pendingRoomDataRef = useRef<Room | null>(null);
  const scheduledTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runAnimationRef = useRef<((snap: Room) => void) | null>(null);
  const tokenPixelsRef = useRef<Record<string, { x: number; y: number }>>({});
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Resize handler ────────────────────────────────────────────────────────
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setCellSize((prev) => {
          const next = calculateCellSize();
          return Math.abs(prev - next) > 2 ? next : prev;
        });
      }, 100);
    };
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
      clearTimeout(timeoutId);
    };
  }, []);

  // ── Token state (drives rendered positions) ───────────────────────────────
  const [tokenPixels, setTokenPixels] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // Recalculate all tokens when cellSize changes
  useEffect(() => {
    if (prevCellSizeRef.current === cellSize) return;
    prevCellSizeRef.current = cellSize;
    const next: Record<string, { x: number; y: number }> = {};
    Object.keys(positions).forEach((pid) => {
      next[pid] = squareToPixel(positions[pid] ?? 1, pid, cellSize);
    });
    tokenPixelsRef.current = next;
    setTokenPixels({ ...next });
  }, [cellSize, positions]);

  // ── Animation engine ──────────────────────────────────────────────────────
  runAnimationRef.current = (snap: Room) => {
    const pid = snap.lastRolledBy;
    if (!pid) return;

    const from = snap.lastFrom ?? 1;
    const finalPos = snap.positions?.[pid] ?? from;
    const diceVal = snap.lastDice ?? 0;
    const naturalEnd = Math.min(100, from + diceVal);

    // Clear any previously scheduled timeouts
    scheduledTimeoutsRef.current.forEach(clearTimeout);
    scheduledTimeoutsRef.current = [];

    // Build the step-by-step path: from → naturalEnd cell by cell
    const stepDelay = 300; // ms per cell step, matching the original
    const steps = naturalEnd - from; // one step per dice value

    // Animate cell-by-cell: loop runs for (let s = 1; s <= steps; s++)
    // so targetCell = from + s covers from+1 … from+steps = naturalEnd ✓
    for (let s = 1; s <= steps; s++) {
      const targetCell = from + s;
      const t = setTimeout(() => {
        const px = squareToPixel(targetCell, pid, cellSize);
        tokenPixelsRef.current = { ...tokenPixelsRef.current, [pid]: px };
        setTokenPixels({ ...tokenPixelsRef.current });
      }, s * stepDelay);
      scheduledTimeoutsRef.current.push(t);
    }

    const stepsDuration = steps * stepDelay;

    // If snake or ladder, animate the jump after stepping is done
    if (finalPos !== naturalEnd) {
      const isSnake = finalPos < naturalEnd;

      // Pause 400ms after the last cell step before starting the snake/ladder path
      const jumpDelay = stepsDuration + 400;
      const jumpT = setTimeout(() => {
        const aCenter = cellCenter(naturalEnd, cellSize);
        const bCenter = cellCenter(finalPos, cellSize);
        const aPixel = {
          x: aCenter.x + getClusterOffset(pid).x,
          y: aCenter.y + getClusterOffset(pid).y,
        };
        const bPixel = {
          x: bCenter.x + getClusterOffset(pid).x,
          y: bCenter.y + getClusterOffset(pid).y,
        };

        const curveSteps = 30;
        const frameDuration = isSnake ? 2000 : 1200; // snake: 2000ms, ladder: 1200ms
        const frameDelay = frameDuration / curveSteps;

        let waveDir = 1;
        if (isSnake) {
          const snakeIndex = Object.keys(SNAKES).indexOf(String(naturalEnd));
          waveDir = snakeIndex % 2 === 0 ? 1 : -1;
        }

        const curvePoints = isSnake
          ? getPointsAlongCurve(aPixel, bPixel, waveDir, curveSteps)
          : getPointsAlongLine(aPixel, bPixel, curveSteps);

        curvePoints.forEach((pt, i) => {
          const frameT = setTimeout(() => {
            tokenPixelsRef.current = { ...tokenPixelsRef.current, [pid]: pt };
            setTokenPixels({ ...tokenPixelsRef.current });
          }, i * frameDelay);
          scheduledTimeoutsRef.current.push(frameT);
        });
      }, jumpDelay);
      scheduledTimeoutsRef.current.push(jumpT);
    }
  };

  // ── Effect 1: store pending room data, set observer fallback ─────────────
  useEffect(() => {
    if (!roomData) return;

    const ts: any = roomData.updatedAt;
    const moveKey = `${roomData.lastRolledBy}|${roomData.lastDice}|${ts?.seconds ?? ""}|${ts?.nanoseconds ?? ""}`;

    if (moveKey === lastMoveKeyRef.current) return;

    // New move arrived — store it, wait for diceComplete
    pendingRoomDataRef.current = roomData;

    // Snap all tokens to current positions for new players / game start
    if (roomData.positions) {
      const next: Record<string, { x: number; y: number }> = {};
      Object.keys(roomData.positions).forEach((pid) => {
        if (!tokenPixelsRef.current[pid]) {
          next[pid] = squareToPixel(roomData.positions![pid] ?? 1, pid, cellSize);
        }
      });
      if (Object.keys(next).length > 0) {
        tokenPixelsRef.current = { ...tokenPixelsRef.current, ...next };
        setTokenPixels({ ...tokenPixelsRef.current });
      }
    }

    // Safety fallback: if diceComplete never fires, run animation after 5s
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

  // ── Effect 2: fire animation when diceComplete becomes true ──────────────
  useEffect(() => {
    if (!diceComplete) return;
    if (!pendingRoomDataRef.current) return;

    const snap = pendingRoomDataRef.current;
    const ts: any = snap.updatedAt;
    const moveKey = `${snap.lastRolledBy}|${snap.lastDice}|${ts?.seconds ?? ""}|${ts?.nanoseconds ?? ""}`;

    if (moveKey === lastMoveKeyRef.current) return;

    // Clear the fallback timeout since we're firing properly
    if (observerTimeoutRef.current) {
      clearTimeout(observerTimeoutRef.current);
      observerTimeoutRef.current = null;
    }

    lastMoveKeyRef.current = moveKey;
    pendingRoomDataRef.current = null;
    runAnimationRef.current?.(snap);
  }, [diceComplete]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      scheduledTimeoutsRef.current.forEach(clearTimeout);
      if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
    };
  }, []);

  const playerIds = Object.keys(positions);

  // ── Render ────────────────────────────────────────────────────────────────
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
          position: "relative",
          width: boardSize,
          height: boardSize,
          borderRadius: 8,
          background: "#FFF",
          boxShadow:
            "0 12px 36px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)",
          outline: "6px solid #5C2A00",
          outlineOffset: "2px",
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
                border: "1px solid rgba(0,0,0,0.6)",
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: 4,
                  fontSize: num === 1 ? 11 : 14,
                  fontWeight: 900,
                  color: "#111",
                  textShadow: "1px 1px 0px rgba(255,255,255,0.7)",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  lineHeight: 1,
                }}
              >
                {num === 1 ? "START" : num}
              </span>
            </div>
          );
        })}

        {/* SVG overlay */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
            zIndex: 5,
          }}
          width={boardSize}
          height={boardSize}
        >
          {/* Ladders */}
          {ladderEntries.map(({ from, to }) => {
            const a = cellCenter(from, cellSize);
            const b = cellCenter(to, cellSize);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / dist;
            const ny = dx / dist;
            const W = 16;
            const r1a = { x: a.x + (nx * W) / 2, y: a.y + (ny * W) / 2 };
            const r1b = { x: b.x + (nx * W) / 2, y: b.y + (ny * W) / 2 };
            const r2a = { x: a.x - (nx * W) / 2, y: a.y - (ny * W) / 2 };
            const r2b = { x: b.x - (nx * W) / 2, y: b.y - (ny * W) / 2 };
            const rungsCount = Math.floor(dist / 18);

            return (
              <g key={`l-${from}`}>
                <line x1={r1a.x + 3} y1={r1a.y + 4} x2={r1b.x + 3} y2={r1b.y + 4}
                  stroke="rgba(0,0,0,0.4)" strokeWidth="6" strokeLinecap="round" />
                <line x1={r2a.x + 3} y1={r2a.y + 4} x2={r2b.x + 3} y2={r2b.y + 4}
                  stroke="rgba(0,0,0,0.4)" strokeWidth="6" strokeLinecap="round" />
                <line x1={r1a.x} y1={r1a.y} x2={r1b.x} y2={r1b.y}
                  stroke="#6E3B16" strokeWidth="6" strokeLinecap="round" />
                <line x1={r2a.x} y1={r2a.y} x2={r2b.x} y2={r2b.y}
                  stroke="#6E3B16" strokeWidth="6" strokeLinecap="round" />
                <line x1={r1a.x} y1={r1a.y} x2={r1b.x} y2={r1b.y}
                  stroke="#A86C3E" strokeWidth="2" strokeDasharray="10 8" opacity="0.6" />
                <line x1={r2a.x} y1={r2a.y} x2={r2b.x} y2={r2b.y}
                  stroke="#A86C3E" strokeWidth="2" strokeDasharray="10 8" opacity="0.6" />
                {Array.from({ length: rungsCount }, (_, i) => {
                  const t = (i + 1) / (rungsCount + 1);
                  const rx = a.x + dx * t;
                  const ry = a.y + dy * t;
                  const rung1 = {
                    x: rx + nx * (W / 2 + 2),
                    y: ry + ny * (W / 2 + 2),
                  };
                  const rung2 = {
                    x: rx - nx * (W / 2 + 2),
                    y: ry - ny * (W / 2 + 2),
                  };
                  return (
                    <g key={`rung-${i}`}>
                      <line x1={rung1.x + 1} y1={rung1.y + 2} x2={rung2.x + 1} y2={rung2.y + 2}
                        stroke="rgba(0,0,0,0.4)" strokeWidth="4" />
                      <line x1={rung1.x} y1={rung1.y} x2={rung2.x} y2={rung2.y}
                        stroke="#8B5A2B" strokeWidth="4" strokeLinecap="round" />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Snakes */}
          {snakeEntries.map(({ from, to, index }) => {
            const a = cellCenter(from, cellSize);
            const b = cellCenter(to, cellSize);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const waveDir = index % 2 === 0 ? 1 : -1;
            const offset = dist * 0.25 * waveDir;
            const nx = -dy / dist;
            const ny = dx / dist;
            const cp1x = a.x + dx * 0.33 + nx * offset;
            const cp1y = a.y + dy * 0.33 + ny * offset;
            const cp2x = a.x + dx * 0.66 - nx * offset;
            const cp2y = a.y + dy * 0.66 - ny * offset;
            const path = `M ${a.x} ${a.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${b.x} ${b.y}`;
            const headAngle = Math.atan2(cp1y - a.y, cp1x - a.x);
            const style = SNAKE_STYLES[index % SNAKE_STYLES.length];

            return (
              <g key={`s-${from}`}>
                <path d={path} stroke="rgba(0,0,0,0.4)" strokeWidth="16"
                  fill="none" strokeLinecap="round" transform="translate(4, 5)" />
                <path d={path} stroke="#111" strokeWidth="18"
                  fill="none" strokeLinecap="round" />
                <path d={path} stroke={style.body} strokeWidth="14"
                  fill="none" strokeLinecap="round" />
                <path d={path} stroke={style.belly} strokeWidth="6"
                  strokeDasharray="6 8" fill="none" strokeLinecap="round" opacity="0.8" />
                <g transform={`translate(${a.x}, ${a.y}) rotate(${(headAngle * 180) / Math.PI})`}>
                  <path d="M -12 0 L -22 -4 M -12 0 L -22 4"
                    stroke="#E74C3C" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <ellipse cx="-4" cy="0" rx="14" ry="11"
                    fill={style.body} stroke="#111" strokeWidth="2" />
                  <circle cx="-8" cy="-5" r="3.5" fill="#FFF" stroke="#111" strokeWidth="1" />
                  <circle cx="-8" cy="5"  r="3.5" fill="#FFF" stroke="#111" strokeWidth="1" />
                  <circle cx="-9" cy="-5" r="1.5" fill="#111" />
                  <circle cx="-9" cy="5"  r="1.5" fill="#111" />
                </g>
              </g>
            );
          })}
        </svg>

        {/* Tokens */}
        {playerIds.map((pid) => {
          const px = tokenPixels[pid];
          if (!px) return null;
          const tokenSize = Math.min(16, Math.max(10, cellSize * 0.35));
          return (
            <div
              key={pid}
              style={{
                position: "absolute",
                width: tokenSize,
                height: tokenSize,
                borderRadius: "50%",
                background: roomData?.playerColors?.[pid] || getPlayerColor(pid),
                border: "2px solid #fff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
                top: 0,
                left: 0,
                transform: `translate(calc(${px.x}px - 50%), calc(${px.y}px - 50%))`,
                transition: "transform 0.15s ease-out",
                zIndex: 20,
                pointerEvents: "none",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      {!hideLegend && playerIds.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 20,
            justifyContent: "center",
          }}
        >
          {playerIds.map((pid) => (
            <div
              key={`legend-${pid}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg-tertiary)",
                borderRadius: 24,
                padding: "6px 14px",
                fontSize: 14,
                fontWeight: 600,
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: roomData?.playerColors?.[pid] || getPlayerColor(pid),
                }}
              />
              {playerNames[pid] || pid}
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 12,
                  marginLeft: 4,
                }}
              >
                (Pos: {positions[pid] ?? 1})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}