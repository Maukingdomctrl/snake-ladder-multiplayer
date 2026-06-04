import { useMemo, useEffect, useRef, useState } from "react";

const LADDERS = {
  8: 26, 19: 38, 28: 53, 21: 82,
  36: 57, 43: 77, 50: 91, 54: 88,
  61: 99, 62: 95,
};

const SNAKES = {
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
  { body: '#8E44AD', belly: '#F1C40F' }, 
  { body: '#2980B9', belly: '#85C1E9' }, 
  { body: '#C0392B', belly: '#17202A' }, 
  { body: '#27AE60', belly: '#F1C40F' }, 
  { body: '#D35400', belly: '#F39C12' }, 
  { body: '#34495E', belly: '#95A5A6' }, 
];

function getCellColor(num) {
  return CELL_COLORS[(num - 1) % CELL_COLORS.length];
}

function cellToPos(num) {
  const row = 9 - Math.floor((num - 1) / 10);
  const rowFromBottom = Math.floor((num - 1) / 10);
  const col = rowFromBottom % 2 === 0
    ? (num - 1) % 10
    : 9 - (num - 1) % 10;
  return { row, col };
}

function cellCenter(num, cellSize) {
  const { row, col } = cellToPos(num);
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
}

// Generate a deterministic number from a string
function getPidHash(pid) {
  return pid.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

// Deterministic player color
function getPlayerColor(pid) {
  return PLAYER_COLORS[getPidHash(pid) % PLAYER_COLORS.length];
}

// --- Path Sampling Utilities ---
function getPointsAlongLine(from, to, cellSize, steps = 10) {
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

function getPointsAlongCurve(from, to, index, cellSize, steps = 14) {
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
      x: mt*mt*mt*a.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*b.x,
      y: mt*mt*mt*a.y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*b.y,
    });
  }
  return points;
}
// -------------------------------

export default function Board({ positions = {}, playerNames = {}, roomData }) {
  const CELL = 56;
  const BOARD = CELL * 10;

  const snakeEntries = useMemo(() => Object.entries(SNAKES).map(([from, to], i) => ({
    from: Number(from), to: Number(to), index: i
  })), []);

  const ladderEntries = useMemo(() => Object.entries(LADDERS).map(([from, to], i) => ({
    from: Number(from), to: Number(to), index: i
  })), []);

  const playerIds = Object.keys(positions);

  // --- Exact Pixel Coordinates Engine ---
  const [tokenPixels, setTokenPixels] = useState({});
  const animatingRef = useRef(false);

  // Initialize and catch late joiners
  useEffect(() => {
    setTokenPixels(prev => {
      const updated = { ...prev };
      let changed = false;
      Object.keys(positions).forEach((pid) => {
        if (!updated[pid]) {
          const pos = positions[pid] ?? 1;
          const { row, col } = cellToPos(pos);
          const offsetMultiplier = [
            { x: 0, y: 0 }, { x: -4, y: -4 }, { x: 4, y: 4 }, { x: 4, y: -4 },
            { x: -4, y: 4 }, { x: 0, y: -6 }, { x: -6, y: 0 }, { x: 6, y: 0 }
          ];
          const offset = offsetMultiplier[getPidHash(pid) % offsetMultiplier.length];
          updated[pid] = {
            x: col * CELL + CELL / 2 - 8 + offset.x,
            y: row * CELL + CELL / 2 - 8 + offset.y,
          };
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [positions, CELL]);

  // Main Stepping & Sliding Animation Effect
  useEffect(() => {
    if (animatingRef.current) return;
    
    const pid = roomData?.lastRolledBy;
    if (!pid || !tokenPixels[pid]) return;
    
    const lastFrom = roomData?.lastFrom ?? 1;
    const lastDice = roomData?.lastDice ?? 0;
    const finalPos = positions[pid] ?? 1;
    const movedTo = Math.min(100, lastFrom + lastDice);
    
    const offsetMultiplier = [
      { x: 0, y: 0 }, { x: -4, y: -4 }, { x: 4, y: 4 }, { x: 4, y: -4 },
      { x: -4, y: 4 }, { x: 0, y: -6 }, { x: -6, y: 0 }, { x: 6, y: 0 }
    ];
    const clusterOffset = offsetMultiplier[getPidHash(pid) % offsetMultiplier.length];
    
    animatingRef.current = true;
    const schedule = []; // { time, x, y }
    let cursor = 0;
    const STEP_MS = 300;
    
    // Phase 1: Step square by square physically along the path
    for (let s = lastFrom + 1; s <= movedTo; s++) {
      const { row, col } = cellToPos(s);
      schedule.push({
        time: cursor,
        x: col * CELL + CELL / 2 - 8 + clusterOffset.x,
        y: row * CELL + CELL / 2 - 8 + clusterOffset.y,
      });
      cursor += STEP_MS;
    }
    
    // Phase 2: If we land on a snake or ladder, slide down the drawn path!
    if (movedTo !== finalPos) {
      const isSnake = finalPos < movedTo;
      const snakeIdx = Object.keys(SNAKES).indexOf(String(movedTo));
      const ladderIdx = Object.keys(LADDERS).indexOf(String(movedTo));
      
      const pathPoints = isSnake
        ? getPointsAlongCurve(movedTo, finalPos, snakeIdx, CELL, 16)
        : getPointsAlongLine(movedTo, finalPos, CELL, 12);
        
      cursor += 300; // Dramatic pause before sliding
      
      pathPoints.forEach((pt) => {
        schedule.push({
          time: cursor,
          x: pt.x - 8 + clusterOffset.x,
          y: pt.y - 8 + clusterOffset.y,
        });
        cursor += 120; // Pace along the sampled path
      });
    }
    
    // Fire all scheduled coordinate updates
    schedule.forEach(({ time, x, y }) => {
      setTimeout(() => {
        setTokenPixels(prev => ({ ...prev, [pid]: { x, y } }));
      }, time);
    });
    
    // Release the animation lock when complete
    setTimeout(() => {
      animatingRef.current = false;
    }, cursor + 200);
    
  }, [positions, roomData, tokenPixels, CELL]);
  // -------------------------------------------

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "0px",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        position: "relative",
        width: BOARD,
        height: BOARD,
        borderRadius: 8,
        background: "#FFF",
        boxShadow: "0 12px 36px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)",
        border: "none",
        outline: "6px solid #5C2A00",
        outlineOffset: "2px",
      }}>

        {/* Cells Render */}
        {Array.from({ length: 100 }, (_, i) => {
          const num = i + 1;
          const { row, col } = cellToPos(num);

          return (
            <div
              key={num}
              style={{
                position: "absolute",
                left: col * CELL,
                top: row * CELL,
                width: CELL,
                height: CELL,
                background: getCellColor(num),
                border: "1px solid rgba(0,0,0,0.6)",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{
                position: "absolute",
                top: 2,
                left: 4,
                fontSize: num === 1 ? 11 : 14,
                fontWeight: 900,
                color: "#111",
                textShadow: "1px 1px 0px rgba(255,255,255,0.7)",
                userSelect: "none",
                lineHeight: 1,
              }}>
                {num === 1 ? "START" : num}
              </span>
            </div>
          );
        })}

        {/* SVG Overlay */}
        <svg
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 5 }}
          width={BOARD}
          height={BOARD}
        >
          {ladderEntries.map(({ from, to, index }) => {
            const a = cellCenter(from, CELL);
            const b = cellCenter(to, CELL);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / dist;
            const ny = dx / dist;

            const W = 16; 
            const r1a = { x: a.x + nx * W/2, y: a.y + ny * W/2 };
            const r1b = { x: b.x + nx * W/2, y: b.y + ny * W/2 };
            const r2a = { x: a.x - nx * W/2, y: a.y - ny * W/2 };
            const r2b = { x: b.x - nx * W/2, y: b.y - ny * W/2 };

            const rungsCount = Math.floor(dist / 18);
            
            return (
              <g key={`l-${from}`}>
                <line x1={r1a.x+3} y1={r1a.y+4} x2={r1b.x+3} y2={r1b.y+4} stroke="rgba(0,0,0,0.4)" strokeWidth="6" strokeLinecap="round" />
                <line x1={r2a.x+3} y1={r2a.y+4} x2={r2b.x+3} y2={r2b.y+4} stroke="rgba(0,0,0,0.4)" strokeWidth="6" strokeLinecap="round" />
                <line x1={r1a.x} y1={r1a.y} x2={r1b.x} y2={r1b.y} stroke="#6E3B16" strokeWidth="6" strokeLinecap="round" />
                <line x1={r2a.x} y1={r2a.y} x2={r2b.x} y2={r2b.y} stroke="#6E3B16" strokeWidth="6" strokeLinecap="round" />
                <line x1={r1a.x} y1={r1a.y} x2={r1b.x} y2={r1b.y} stroke="#A86C3E" strokeWidth="2" strokeDasharray="10 8" opacity="0.6" />
                <line x1={r2a.x} y1={r2a.y} x2={r2b.x} y2={r2b.y} stroke="#A86C3E" strokeWidth="2" strokeDasharray="10 8" opacity="0.6" />

                {Array.from({ length: rungsCount }, (_, i) => {
                  const t = (i + 1) / (rungsCount + 1);
                  const rx = a.x + dx * t;
                  const ry = a.y + dy * t;
                  const rung1 = { x: rx + nx * (W/2 + 2), y: ry + ny * (W/2 + 2) };
                  const rung2 = { x: rx - nx * (W/2 + 2), y: ry - ny * (W/2 + 2) };
                  return (
                    <g key={`rung-${i}`}>
                      <line x1={rung1.x+1} y1={rung1.y+2} x2={rung2.x+1} y2={rung2.y+2} stroke="rgba(0,0,0,0.4)" strokeWidth="4" />
                      <line x1={rung1.x} y1={rung1.y} x2={rung2.x} y2={rung2.y} stroke="#8B5A2B" strokeWidth="4" strokeLinecap="round" />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {snakeEntries.map(({ from, to, index }) => {
            const a = cellCenter(from, CELL); 
            const b = cellCenter(to, CELL);   
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
                <path d={path} stroke="rgba(0,0,0,0.4)" strokeWidth="16" fill="none" strokeLinecap="round" transform="translate(4, 5)" />
                <path d={path} stroke="#111" strokeWidth="18" fill="none" strokeLinecap="round" />
                <path d={path} stroke={style.body} strokeWidth="14" fill="none" strokeLinecap="round" />
                <path d={path} stroke={style.belly} strokeWidth="6" strokeDasharray="6 8" fill="none" strokeLinecap="round" opacity="0.8" />
                
                <g transform={`translate(${a.x}, ${a.y}) rotate(${headAngle * 180 / Math.PI})`}>
                  <path d="M -12 0 L -22 -4 M -12 0 L -22 4" stroke="#E74C3C" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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

        {/* Dynamic Token Layer (Pixel based) */}
        {playerIds.map((pid) => {
          const px = tokenPixels[pid];
          if (!px) return null; // Wait for initial load
          
          return (
            <div
              key={pid}
              style={{
                position: "absolute",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: getPlayerColor(pid),
                border: "2px solid #fff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
                left: px.x,
                top: px.y,
                zIndex: 20,
                // Using a fast 0.25s ease ensures smooth connections between the rapid 120ms path sampling steps!
                transition: "left 0.25s ease, top 0.25s ease",
                pointerEvents: "none",
              }}
            />
          );
        })}

      </div>

      {/* Modern Player Legend */}
      {playerIds.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 20,
          justifyContent: "center",
        }}>
          {playerIds.map((pid) => (
            <div key={`legend-${pid}`} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#FFF",
              borderRadius: 24,
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 600,
              border: "1px solid #ccc",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                background: getPlayerColor(pid),
                boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.2)"
              }} />
              {playerNames[pid] || pid}
              <span style={{ color: "#7F8C8D", fontSize: 12, marginLeft: 4 }}>
                (Pos: {positions[pid] ?? 1})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}