// Board layout for drawing Ludo. The rules live on the server
// (server/ludo/engine.js); the constants below describe the same board and
// are checked against the engine by board.test.ts.
//
// The board is a 15×15 grid. Red's yard is top-left, then clockwise Green,
// Yellow, Blue. Token positions are "progress" values: -1 base, 0..50 main
// track, 51..55 own home column, 56 home.
import type { LudoColor } from "./types";

export const COLORS: readonly LudoColor[] = ["red", "green", "yellow", "blue"];
export const GRID = 15;
export const TRACK_LENGTH = 52;
export const LAST_TRACK_PROGRESS = 50;
export const HOME_PROGRESS = 56;
export const BASE = -1;
export const START_INDEX: Readonly<Record<LudoColor, number>> = { red: 0, green: 13, yellow: 26, blue: 39 };
export const STAR_INDICES: readonly number[] = [8, 21, 34, 47];

export type Cell = { row: number; col: number };
export type Point = { x: number; y: number };

// The 52 shared squares, clockwise from Red's start square.
export const TRACK: readonly Cell[] = (() => {
  const cells: Cell[] = [];
  const run = (fromRow: number, fromCol: number, dRow: number, dCol: number, length: number) => {
    for (let i = 0; i < length; i++) cells.push({ row: fromRow + dRow * i, col: fromCol + dCol * i });
  };
  run(6, 1, 0, 1, 5); // red arm, top row →
  run(5, 6, -1, 0, 6); // green arm, left column ↑
  run(0, 7, 0, 1, 2); // top tip →
  run(1, 8, 1, 0, 5); // green arm, right column ↓
  run(6, 9, 0, 1, 6); // yellow arm, top row →
  run(7, 14, 1, 0, 2); // right tip ↓
  run(8, 13, 0, -1, 5); // yellow arm, bottom row ←
  run(9, 8, 1, 0, 6); // blue arm, right column ↓
  run(14, 7, 0, -1, 2); // bottom tip ←
  run(13, 6, -1, 0, 5); // blue arm, left column ↑
  run(8, 5, 0, -1, 6); // red arm, bottom row ←
  run(7, 0, -1, 0, 2); // left tip ↑
  return cells;
})();

// Each colour's home column (5 squares), in travel order.
export const LANES: Readonly<Record<LudoColor, readonly Cell[]>> = {
  red: [1, 2, 3, 4, 5].map((col) => ({ row: 7, col })),
  green: [1, 2, 3, 4, 5].map((row) => ({ row, col: 7 })),
  yellow: [13, 12, 11, 10, 9].map((col) => ({ row: 7, col })),
  blue: [13, 12, 11, 10, 9].map((row) => ({ row, col: 7 })),
};

// Top-left cell of each 6×6 yard.
export const YARDS: Readonly<Record<LudoColor, Cell>> = {
  red: { row: 0, col: 0 },
  green: { row: 0, col: 9 },
  yellow: { row: 9, col: 9 },
  blue: { row: 9, col: 0 },
};

// Where each colour's home triangle sits inside the 3×3 centre.
const HOME_CENTRE: Readonly<Record<LudoColor, Point>> = {
  red: { x: 6.55, y: 7.5 },
  green: { x: 7.5, y: 6.55 },
  yellow: { x: 8.45, y: 7.5 },
  blue: { x: 7.5, y: 8.45 },
};

export const cellCenter = (cell: Cell): Point => ({ x: cell.col + 0.5, y: cell.row + 0.5 });

export function trackIndex(color: LudoColor, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK_PROGRESS) return null;
  return (START_INDEX[color] + progress) % TRACK_LENGTH;
}

export function isSafeTrackIndex(index: number, safeSquares = true): boolean {
  if (!safeSquares) return false;
  return STAR_INDICES.includes(index) || Object.values(START_INDEX).includes(index);
}

/** The board square a token occupies, or null while in its yard or home. */
export function tokenCell(color: LudoColor, progress: number): Cell | null {
  const index = trackIndex(color, progress);
  if (index !== null) return TRACK[index];
  if (progress > LAST_TRACK_PROGRESS && progress < HOME_PROGRESS) return LANES[color][progress - LAST_TRACK_PROGRESS - 1];
  return null;
}

/** Centre of a token's resting spot in its yard. */
export function yardSpot(color: LudoColor, token: number): Point {
  const yard = YARDS[color];
  return { x: yard.col + (token % 2 === 0 ? 2 : 4), y: yard.row + (token < 2 ? 2 : 4) };
}

/** Centre of a finished token's slot in its home triangle. */
export function homeSpot(color: LudoColor, token: number): Point {
  const c = HOME_CENTRE[color];
  const dx = token % 2 === 0 ? -0.2 : 0.2;
  const dy = token < 2 ? -0.2 : 0.2;
  return { x: c.x + dx, y: c.y + dy };
}

/** Squares a token passes through from `from` to `to` (excluding `from`). */
export function stepPath(from: number, to: number): number[] {
  if (from === BASE) return [0];
  if (to === BASE) return [BASE];
  const steps: number[] = [];
  for (let p = from + 1; p <= to; p++) steps.push(p);
  return steps;
}

/** Human-readable place for screen readers. */
export function describeProgress(progress: number): string {
  if (progress === BASE) return "in base";
  if (progress === HOME_PROGRESS) return "home";
  if (progress > LAST_TRACK_PROGRESS) return `in home column, ${HOME_PROGRESS - progress} from home`;
  return `${HOME_PROGRESS - progress} squares from home`;
}
