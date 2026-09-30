// The Ludo board: a static SVG (vector, crisp at any size) with tokens as
// buttons on top. The board only draws what it is given — which tokens may
// move comes from the server via `selectable`.
import { memo, useMemo } from "react";
import {
  COLORS,
  GRID,
  LANES,
  LAST_TRACK_PROGRESS,
  START_INDEX,
  STAR_INDICES,
  TRACK,
  TRACK_LENGTH,
  YARDS,
  cellCenter,
  describeProgress,
  yardSpot,
  type Point,
} from "../board";
import { layoutTokens } from "../layout";
import { COLOR_LABEL } from "../state";
import { PALETTE } from "../theme";
import type { LudoColor, LudoTokens } from "../types";

const TOKEN_SIZE = 0.8; // in board squares

// Direction of the arrow on each colour's home-column entrance.
const ENTRY_ARROW: Record<LudoColor, number> = { red: 0, green: 90, yellow: 180, blue: 270 };

function starPoints({ x, y }: Point, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(x + r * Math.cos(a)).toFixed(3)},${(y + r * Math.sin(a)).toFixed(3)}`);
  }
  return pts.join(" ");
}

const startColorAt = new Map(COLORS.map((c) => [START_INDEX[c], c]));
const entranceAt = new Map(COLORS.map((c) => [(START_INDEX[c] + LAST_TRACK_PROGRESS) % TRACK_LENGTH, c]));

/** Everything that never moves. Re-renders only if the seated colours change. */
const BoardArt = memo(function BoardArt({ inPlay, safeSquares }: { inPlay: string; safeSquares: boolean }) {
  const seated = inPlay.split(",");
  return (
    <svg className="ludo-art" viewBox={`0 0 ${GRID} ${GRID}`} aria-hidden="true" focusable="false">
      <rect x={0} y={0} width={GRID} height={GRID} fill="#fffdf7" />

      {COLORS.map((color) => {
        const { row, col } = YARDS[color];
        const p = PALETTE[color];
        return (
          <g key={color}>
            <rect x={col} y={row} width={6} height={6} fill={p.base} />
            <rect x={col + 0.2} y={row + 0.2} width={5.6} height={5.6} rx={0.45} fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth={0.06} />
            <rect x={col + 0.85} y={row + 0.85} width={4.3} height={4.3} rx={0.55} fill="#fff" stroke={p.dark} strokeWidth={0.06} />
            {[0, 1, 2, 3].map((i) => {
              const s = yardSpot(color, i);
              return <circle key={i} cx={s.x} cy={s.y} r={0.62} fill={p.light} stroke={p.base} strokeWidth={0.08} />;
            })}
            {!seated.includes(color) && <rect x={col} y={row} width={6} height={6} fill="rgb(255 253 247 / 0.62)" />}
          </g>
        );
      })}

      {TRACK.map((cell, i) => {
        const startColor = startColorAt.get(i);
        return (
          <rect
            key={`t${i}`}
            x={cell.col}
            y={cell.row}
            width={1}
            height={1}
            fill={startColor ? PALETTE[startColor].base : "#fffdf7"}
            stroke="#d9cfbf"
            strokeWidth={0.04}
          />
        );
      })}

      {COLORS.map((color) =>
        LANES[color].map((cell, i) => (
          <rect key={`${color}${i}`} x={cell.col} y={cell.row} width={1} height={1} fill={PALETTE[color].base} stroke={PALETTE[color].dark} strokeOpacity={0.35} strokeWidth={0.04} />
        ))
      )}

      {safeSquares &&
        [...STAR_INDICES, ...COLORS.map((c) => START_INDEX[c])].map((i) => (
          <polygon
            key={`s${i}`}
            points={starPoints(cellCenter(TRACK[i]), 0.34, 0.15)}
            fill={startColorAt.has(i) ? "rgb(255 255 255 / 0.9)" : "#c9a13f"}
            stroke={startColorAt.has(i) ? "none" : "#9c7a24"}
            strokeWidth={0.03}
          />
        ))}

      {[...entranceAt.entries()].map(([i, color]) => {
        const c = cellCenter(TRACK[i]);
        return (
          <path
            key={`a${color}`}
            d="M -0.26 -0.24 L 0.24 0 L -0.26 0.24 Z"
            transform={`translate(${c.x} ${c.y}) rotate(${ENTRY_ARROW[color]})`}
            fill={PALETTE[color].base}
          />
        );
      })}

      {/* Home: four triangles meeting in the centre */}
      <polygon points="6,6 7.5,7.5 6,9" fill={PALETTE.red.base} />
      <polygon points="6,6 9,6 7.5,7.5" fill={PALETTE.green.base} />
      <polygon points="9,6 9,9 7.5,7.5" fill={PALETTE.yellow.base} />
      <polygon points="6,9 9,9 7.5,7.5" fill={PALETTE.blue.base} />
      <path d="M6 6 L9 9 M9 6 L6 9" stroke="rgb(255 255 255 / 0.7)" strokeWidth={0.05} />
      <rect x={6} y={6} width={3} height={3} fill="none" stroke="#b9ab94" strokeWidth={0.05} />
    </svg>
  );
});

type Props = {
  /** Outer edge in px, frame included (the stage scales it with a transform). */
  size: number;
  colorsInPlay: readonly LudoColor[];
  tokens: LudoTokens;
  turnColor: LudoColor | null;
  myColor: LudoColor | null;
  /** Token numbers the local player may move right now (from the server). */
  selectable: readonly number[] | null;
  /** Token highlighted from the move buttons below the board. */
  focusToken: number | null;
  movingToken: string | null;
  capturedTokens: readonly string[];
  homeToken: string | null;
  names: Partial<Record<LudoColor, string>>;
  safeSquares: boolean;
  onPick: (token: number) => void;
};

export default function LudoBoard({
  size,
  colorsInPlay,
  tokens,
  turnColor,
  myColor,
  selectable,
  focusToken,
  movingToken,
  capturedTokens,
  homeToken,
  names,
  safeSquares,
  onPick,
}: Props) {
  const frame = Math.max(4, Math.min(12, Math.round(size * 0.022)));
  const inner = size - frame * 2;
  const unit = inner / GRID;
  const tokenPx = Math.round(unit * TOKEN_SIZE);
  const placed = useMemo(() => layoutTokens(tokens, colorsInPlay), [tokens, colorsInPlay]);

  return (
    <div className="ludo-frame" style={{ padding: frame, borderRadius: Math.max(8, frame * 1.2) }}>
      <div className="ludo-board" style={{ width: inner, height: inner }} role="group" aria-label="Ludo board">
        <BoardArt inPlay={colorsInPlay.join(",")} safeSquares={safeSquares} />

        {turnColor && (
          <div
            className="ludo-turn-glow"
            style={{
              left: YARDS[turnColor].col * unit,
              top: YARDS[turnColor].row * unit,
              width: 6 * unit,
              height: 6 * unit,
              ["--glow" as string]: PALETTE[turnColor].base,
            }}
          />
        )}

        {unit >= 18 &&
          colorsInPlay.map((color) => {
            const { row, col } = YARDS[color];
            const bottom = row > 0;
            return (
              <div
                key={color}
                className="ludo-yard-label"
                style={{
                  left: (col + 0.3) * unit,
                  top: (row + (bottom ? 5.22 : 0.06)) * unit,
                  width: 5.4 * unit,
                  height: 0.72 * unit,
                  fontSize: Math.max(10, unit * 0.42),
                }}
              >
                {names[color] ?? COLOR_LABEL[color]}
              </div>
            );
          })}

        {placed.map(({ id, color, index, progress, x, y, scale }) => {
          const legal = color === myColor && Boolean(selectable?.includes(index));
          const dim = Boolean(selectable) && color === myColor && !legal;
          const classes = [
            "ludo-token",
            `ludo-token--${color}`,
            legal && "is-legal",
            dim && "is-dim",
            id === movingToken && "is-moving",
            capturedTokens.includes(id) && "is-captured",
            id === homeToken && "is-home",
            legal && index === focusToken && "is-focus",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={id}
              type="button"
              className={classes}
              data-token={id}
              style={{
                width: tokenPx,
                height: tokenPx,
                transform: `translate3d(${x * unit - tokenPx / 2}px, ${y * unit - tokenPx / 2}px, 0) scale(${scale})`,
                zIndex: id === movingToken ? 30 : legal ? 20 : 10,
                fontSize: Math.max(8, tokenPx * 0.46),
                ["--token" as string]: PALETTE[color].base,
                ["--token-dark" as string]: PALETTE[color].dark,
              }}
              disabled={!legal}
              tabIndex={legal ? 0 : -1}
              aria-label={`${COLOR_LABEL[color]} token ${index + 1}, ${describeProgress(progress)}${legal ? ", can move" : ""}`}
              onClick={() => legal && onPick(index)}
            >
              <span className="ludo-token__body">
                <span className="ludo-token__num">{index + 1}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
