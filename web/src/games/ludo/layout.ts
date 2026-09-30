// Where each token sits on the board, in board units (1 = one square).
import { BASE, HOME_PROGRESS, cellCenter, homeSpot, tokenCell, yardSpot } from "./board";
import type { LudoColor, LudoTokens } from "./types";

const HOME_SCALE = 0.5;
// Where several tokens share a square, they shrink and fan out.
const STACKS: Record<number, { scale: number; offsets: [number, number][] }> = {
  1: { scale: 1, offsets: [[0, 0]] },
  2: { scale: 0.74, offsets: [[-0.16, -0.16], [0.16, 0.16]] },
  3: { scale: 0.64, offsets: [[-0.18, -0.17], [0.18, -0.17], [0, 0.19]] },
  4: { scale: 0.58, offsets: [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]] },
};
const CROWD = { scale: 0.42, step: 0.26 }; // 5+ tokens on one (safe) square

type Placed = { id: string; color: LudoColor; index: number; progress: number; x: number; y: number; scale: number };

/** Positions every token in board units, fanning out shared squares. */
export function layoutTokens(tokens: LudoTokens, colors: readonly LudoColor[]): Placed[] {
  const placed: Placed[] = [];
  const shared = new Map<string, Placed[]>();
  for (const color of colors) {
    (tokens[color] ?? []).forEach((progress, index) => {
      const id = `${color}-${index}`;
      if (progress === BASE) {
        placed.push({ id, color, index, progress, ...yardSpot(color, index), scale: 1 });
      } else if (progress === HOME_PROGRESS) {
        placed.push({ id, color, index, progress, ...homeSpot(color, index), scale: HOME_SCALE });
      } else {
        const cell = tokenCell(color, progress);
        if (!cell) return;
        const key = `${cell.row}:${cell.col}`;
        const token = { id, color, index, progress, ...cellCenter(cell), scale: 1 };
        placed.push(token);
        shared.set(key, [...(shared.get(key) ?? []), token]);
      }
    });
  }
  for (const group of shared.values()) {
    if (group.length === 1) continue;
    const stack = STACKS[group.length];
    group.forEach((token, i) => {
      if (stack) {
        token.x += stack.offsets[i][0];
        token.y += stack.offsets[i][1];
        token.scale = stack.scale;
      } else {
        token.x += ((i % 3) - 1) * CROWD.step;
        token.y += (Math.floor(i / 3) - 1) * CROWD.step;
        token.scale = CROWD.scale;
      }
    });
  }
  return placed;
}
