import { describe, expect, it } from "vitest";
import {
  BASE,
  COLORS,
  HOME_PROGRESS,
  LANES,
  LAST_TRACK_PROGRESS,
  START_INDEX,
  STAR_INDICES,
  TRACK,
  TRACK_LENGTH,
  YARDS,
  describeProgress,
  homeSpot,
  stepPath,
  tokenCell,
  trackIndex,
  yardSpot,
  type Cell,
} from "./board";
import { layoutTokens } from "./layout";
import { engine } from "./test/fixtures";

const adjacent = (a: Cell, b: Cell) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
const inCross = (c: Cell) => (c.row >= 6 && c.row <= 8) || (c.col >= 6 && c.col <= 8);

describe("board geometry", () => {
  it("uses the same rules constants as the server engine", () => {
    expect(TRACK_LENGTH).toBe(engine.TRACK_LENGTH);
    expect(LAST_TRACK_PROGRESS).toBe(engine.LAST_TRACK_PROGRESS);
    expect(HOME_PROGRESS).toBe(engine.HOME_PROGRESS);
    expect(BASE).toBe(engine.BASE);
    expect(START_INDEX).toEqual(engine.START_INDEX);
    expect(STAR_INDICES).toEqual(engine.STAR_INDICES);
    expect([...COLORS]).toEqual(engine.COLORS);
    for (const color of COLORS) {
      for (let p = -1; p <= HOME_PROGRESS; p++) expect(trackIndex(color, p)).toBe(engine.trackIndex(color, p));
    }
  });

  it("has 52 distinct track squares forming one closed clockwise loop on the cross", () => {
    expect(TRACK).toHaveLength(52);
    expect(new Set(TRACK.map((c) => `${c.row},${c.col}`)).size).toBe(52);
    let cornerSteps = 0;
    TRACK.forEach((cell, i) => {
      expect(inCross(cell)).toBe(true);
      const next = TRACK[(i + 1) % TRACK.length];
      // Squares touch, except the four inner corners, which the path crosses diagonally.
      if (!adjacent(cell, next)) {
        expect(Math.abs(cell.row - next.row)).toBe(1);
        expect(Math.abs(cell.col - next.col)).toBe(1);
        cornerSteps += 1;
      }
    });
    expect(cornerSteps).toBe(4);
  });

  it("starts each colour next to its own yard and turns into its own lane", () => {
    for (const color of COLORS) {
      const start = tokenCell(color, 0)!;
      const yard = YARDS[color];
      const nearYard = start.row >= yard.row - 1 && start.row <= yard.row + 6 && start.col >= yard.col - 1 && start.col <= yard.col + 6;
      expect(nearYard).toBe(true);
      const lastTrack = tokenCell(color, LAST_TRACK_PROGRESS)!;
      expect(adjacent(lastTrack, LANES[color][0])).toBe(true);
      // the lane runs straight into the 3×3 home centre
      LANES[color].forEach((cell, i) => {
        if (i > 0) expect(adjacent(cell, LANES[color][i - 1])).toBe(true);
      });
      const end = LANES[color][4];
      const next = { row: end.row + (end.row - LANES[color][3].row), col: end.col + (end.col - LANES[color][3].col) };
      expect(next.row >= 6 && next.row <= 8 && next.col >= 6 && next.col <= 8).toBe(true);
    }
  });

  it("lanes never overlap the shared track", () => {
    const track = new Set(TRACK.map((c) => `${c.row},${c.col}`));
    for (const color of COLORS) for (const c of LANES[color]) expect(track.has(`${c.row},${c.col}`)).toBe(false);
  });

  it("maps every progress value to a place", () => {
    expect(tokenCell("red", BASE)).toBeNull();
    expect(tokenCell("red", HOME_PROGRESS)).toBeNull();
    expect(tokenCell("red", 53)).toEqual(LANES.red[2]);
    expect(tokenCell("green", 0)).toEqual(TRACK[13]);
    expect(stepPath(BASE, 0)).toEqual([0]);
    expect(stepPath(48, 52)).toEqual([49, 50, 51, 52]);
    expect(describeProgress(BASE)).toBe("in base");
    expect(describeProgress(HOME_PROGRESS)).toBe("home");
    expect(describeProgress(10)).toBe("46 squares from home");
  });
});

describe("token layout", () => {
  it("gives every token in a yard its own spot and finished tokens a home slot", () => {
    const placed = layoutTokens({ red: [BASE, BASE, BASE, HOME_PROGRESS] }, ["red"]);
    const spots = placed.map((t) => `${t.x},${t.y}`);
    expect(new Set(spots).size).toBe(4);
    expect(placed[0]).toMatchObject(yardSpot("red", 0));
    expect(placed[3]).toMatchObject({ ...homeSpot("red", 3), scale: 0.5 });
  });

  it("fans out tokens sharing a square so each stays visible and tappable", () => {
    // red progress 13 and green progress 0 are the same square (green's start)
    const placed = layoutTokens({ red: [13, 13, BASE, BASE], green: [0, BASE, BASE, BASE] }, ["red", "green"]);
    const shared = placed.filter((t) => t.progress !== BASE);
    expect(shared).toHaveLength(3);
    expect(new Set(shared.map((t) => `${t.x},${t.y}`)).size).toBe(3);
    for (const t of shared) expect(t.scale).toBeLessThan(1);
  });

  it("keeps a lone token centred at full size", () => {
    const [token] = layoutTokens({ red: [5, BASE, BASE, BASE] }, ["red"]);
    expect(token).toMatchObject({ x: TRACK[5].col + 0.5, y: TRACK[5].row + 0.5, scale: 1 });
  });
});
