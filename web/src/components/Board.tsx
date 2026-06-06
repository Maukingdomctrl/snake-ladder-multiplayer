import { useMemo, useEffect, useRef, useState } from "react";

const LADDERS: Record<number, number> = {
  8: 26, 19: 38, 28: 53, 21: 82,
  36: 57, 43: 77, 50: 91, 54: 88,
  61: 99, 62: 95,
};

const SNAKES: Record<number, number> = {
  46: 15, 48: 9, 52: 11, 59: 18,
  64: 24, 68: 2, 69: 33, 83: 22,
  89: 51, 93: 37, 98: 13,
};

const PLAYER_COLORS = [
  "#ffffff", "#000000", "#ff00ff", "#00ffff",
  "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
];

const CELL_COLORS = [
  "#E44D26", "#2980B9", "#F1C40F", "#27AE60",
];

const SNAKE_STYLES = [
  { body: "#8E44AD", belly: "#F1C40F" },
  { body: "#2980B9", belly: "#85C1E9" },
  { body: "#C0392B", belly: "#17202A" },
  { body: "#27AE60", belly: "#F1C40F" },
  { body: "#D35400", belly: "#F39C12" },
  { body: "#34495E", belly: "#95A5A6" },
];

const CLUSTER_OFFSETS = [
  { x: 0, y: 0 }, { x: -4, y: -4 }, { x: 4, y: 4 }, { x: 4, y: -4 },
  { x: -4, y: 4 }, { x: 0, y: -6 }, { x: -6, y: 0 }, { x: 6, y: 0 },
];

function getCellColor(num: number) {
  return CELL_COLORS[(num - 1) % CELL_COLORS.length];
}

function cellToPos(num: number) {
  const rowFromBottom = Math.floor((num - 1) / 10);
  const row = 9 - rowFromBottom;
  const col = rowFromBottom % 2 === 0
    ? (num - 1) % 10
    : 9 - ((num - 1) % 10);
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

function getPointsAlongLine(from: number, to: number, cellSize: number, steps = 10) {
  const a = cellCenter(from, cellSize);
  const b = cellCenter(to, cellSize);
  const points = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  }
  return points;
}

function getPointsAlongCurve(from: number, to: number, index: number, cellSize: number, steps = 16) {
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

  const points = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * mt * a.x + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * b.x,
      y: mt * mt * mt * a.y + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * b.y,
    });
  }
  return points;
}

function calculateCellSize() {
  const availableWidth =
    window.innerWidth >= 768
      ? Math.min(window.innerWidth - 380, 800)
      : window.innerWidth - 48;

  const availableHeight =
    window.innerWidth >= 768
      ? window.innerHeight - 320  // ✅ FIX 2: was 280, now 340
      : window.innerHeight - 200;

  const maxBoardSize = Math.min(availableWidth, availableHeight);
  const finalBoardSize = Math.max(300, Math.min(maxBoardSize, 800));

  return Math.floor(finalBoardSize / 10);
}

// ✅ FIX 1a: hideLegend added to interface
interface BoardProps {
  positions?: Record<string, number>;
  playerNames?: Record<string, string>;
  roomData?: any;
  diceComplete?: boolean;
  hideLegend?: boolean;
}

// ✅ FIX 1b: hideLegend destructured with default false
export default function Board({ positions = {}, playerNames = {}, roomData, diceComplete, hideLegend = false }: BoardProps) {
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

  const [tokenPixels, setTokenPixels] = useState<Record<string, { x: number; y: number }>>({});
  const lastMoveKeyRef = useRef("");
  const pendingRoomDataRef = useRef<any>(null);
  const scheduledTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const runAnimationRef = useRef<((snap: any) => void) | null>(null);
  const prevCellSizeRef = useRef(cellSize);

  const tokenPixelsRef = useRef(tokenPixels);
  useEffect(() => {
    tokenPixelsRef.current = tokenPixels;
  }, [tokenPixels]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handler = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setCellSize((prev) => {
          const newSize = calculateCellSize();
          return Math.abs(prev - newSize) > 2 ? newSize : prev;
        });
      }, 100);
    };

    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (prevCellSizeRef.current !== cellSize) {
      const newEntries: Record<string, { x: number; y: number }> = {};
      Object.keys(positions).forEach((pid) => {
        newEntries[pid] = squareToPixel(positions[pid] ?? 1, pid, cellSize);
      });
      setTokenPixels(newEntries);
      scheduledTimeoutsRef.current.forEach(clearTimeout);
      prevCellSizeRef.current = cellSize;
    }
  }, [cellSize, positions]);

  useEffect(() => {
    const newEntries: Record<string, { x: number; y: number }> = {};
    let hasNew = false;
    Object.keys(positions).forEach((pid) => {
      if (tokenPixelsRef.current[pid]) return;
      newEntries[pid] = squareToPixel(positions[pid] ?? 1, pid, cellSize);
      hasNew = true;
    });
    if (hasNew) {
      setTokenPixels((prev) => ({ ...prev, ...newEntries }));
    }
  }, [positions, cellSize]);

  runAnimationRef.current = (snap) => {
    const pid = snap?.lastRolledBy;
    if (!pid) return;

    const lastDice = snap?.lastDice ?? 0;
    if (!lastDice) return;

    const moveKey = `${pid}|${lastDice}|${snap?.updatedAt?.seconds}|${snap?.updatedAt?.nanoseconds}`;
    if (lastMoveKeyRef.current === moveKey) return;
    lastMoveKeyRef.current = moveKey;

    scheduledTimeoutsRef.current.forEach(clearTimeout);
    scheduledTimeoutsRef.current = [];

    const lastFrom = snap?.lastFrom ?? 1;
    const finalPos = snap?.positions?.[pid] ?? 1;
    const movedTo = Math.min(100, lastFrom + lastDice);
    const clusterOffset = getClusterOffset(pid);

    const schedule: { time: number; x: number; y: number }[] = [];
    let cursor = 0;
    const STEP_MS = 300;

    for (let s = lastFrom + 1; s <= movedTo; s++) {
      const { row, col } = cellToPos(s);
      schedule.push({
        time: cursor,
        x: col * cellSize + cellSize / 2 + clusterOffset.x,
        y: row * cellSize + cellSize / 2 + clusterOffset.y,
      });
      cursor += STEP_MS;
    }

    if (movedTo !== finalPos) {
      const isSnake = finalPos < movedTo;
      const snakeIdx = Object.keys(SNAKES).indexOf(String(movedTo));
      const rawPoints = isSnake
        ? getPointsAlongCurve(movedTo, finalPos, snakeIdx, cellSize)
        : getPointsAlongLine(movedTo, finalPos, cellSize);

      cursor += 400;

      rawPoints.forEach((pt) => {
        schedule.push({
          time: cursor,
          x: pt.x + clusterOffset.x,
          y: pt.y + clusterOffset.y,
        });
        cursor += 120;
      });
    }

    schedule.forEach(({ time, x, y }) => {
      const id = setTimeout(() => {
        setTokenPixels((prev) => ({ ...prev, [pid]: { x, y } }));
      }, time);
      scheduledTimeoutsRef.current.push(id);
    });

    const finalPixel = squareToPixel(finalPos, pid, cellSize);
    scheduledTimeoutsRef.current.push(
      setTimeout(() => {
        setTokenPixels((prev) => ({ ...prev, [pid]: finalPixel }));
      }, cursor + 150)
    );
  };

  useEffect(() => {
    const pid = roomData?.lastRolledBy;
    if (!pid) return;

    const lastDice = roomData?.lastDice ?? 0;
    if (!lastDice) return;

    const moveKey = `${pid}|${lastDice}|${roomData?.updatedAt?.seconds}|${roomData?.updatedAt?.nanoseconds}`;
    if (lastMoveKeyRef.current === moveKey) return;

    pendingRoomDataRef.current = roomData;
  }, [roomData]);

  useEffect(() => {
    if (!diceComplete || !pendingRoomDataRef.current) return;

    const snap = pendingRoomDataRef.current;
    pendingRoomDataRef.current = null;
    runAnimationRef.current?.(snap);
  }, [diceComplete]);

  const playerIds = Object.keys(positions);

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
          boxShadow: "0 12px 36px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)",
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

        {/* SVG Overlay for Snakes and Ladders */}
        <svg
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 5 }}
          width={boardSize}
          height={boardSize}
        >
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
                  const rung1 = { x: rx + nx * (W / 2 + 2), y: ry + ny * (W / 2 + 2) };
                  const rung2 = { x: rx - nx * (W / 2 + 2), y: ry - ny * (W / 2 + 2) };
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
                <path d={path} stroke="rgba(0,0,0,0.4)" strokeWidth="16" fill="none"
                  strokeLinecap="round" transform="translate(4, 5)" />
                <path d={path} stroke="#111" strokeWidth="18" fill="none" strokeLinecap="round" />
                <path d={path} stroke={style.body} strokeWidth="14" fill="none" strokeLinecap="round" />
                <path d={path} stroke={style.belly} strokeWidth="6" strokeDasharray="6 8"
                  fill="none" strokeLinecap="round" opacity="0.8" />
                <g transform={`translate(${a.x}, ${a.y}) rotate(${(headAngle * 180) / Math.PI})`}>
                  <path d="M -12 0 L -22 -4 M -12 0 L -22 4"
                    stroke="#E74C3C" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <ellipse cx="-4" cy="0" rx="14" ry="11" fill={style.body} stroke="#111" strokeWidth="2" />
                  <circle cx="-8" cy="-5" r="3.5" fill="#FFF" stroke="#111" strokeWidth="1" />
                  <circle cx="-8" cy="5" r="3.5" fill="#FFF" stroke="#111" strokeWidth="1" />
                  <circle cx="-9" cy="-5" r="1.5" fill="#111" />
                  <circle cx="-9" cy="5" r="1.5" fill="#111" />
                </g>
              </g>
            );
          })}
        </svg>

        {/* Player Tokens */}
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
                transition: "transform 0.28s ease-in-out",
                zIndex: 20,
                pointerEvents: "none",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            />
          );
        })}
      </div>

      {/* ✅ FIX 1c: Legend now gated on !hideLegend */}
      {!hideLegend && playerIds.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 20,
            justifyContent: "center",
            color: "var(--text-primary)",
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
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
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
