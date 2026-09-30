import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE } from "./board";
import { engine, idOf, makeRoom, NAMES, rngOf } from "./test/fixtures";
import type { LudoColor, LudoGame } from "./types";
import { usePresentation } from "./usePresentation";

const options = {
  myId: idOf("red"),
  nameOf: (id: string | null | undefined) => NAMES[(id?.replace("-id", "") ?? "red") as LudoColor],
  sound: false,
};

function setup(game: LudoGame) {
  return renderHook(({ g }) => usePresentation(g, options), { initialProps: { g: game } });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("presentation controller", () => {
  it("shows the current state on first render without replaying history", () => {
    const game = makeRoom({ tokens: { red: [7, BASE, BASE, BASE] } }).ludo.game!;
    const { result } = setup(game);
    expect(result.current.view.stage).toBe("idle");
    expect(result.current.view.tokens.red).toEqual([7, BASE, BASE, BASE]);
  });

  it("animates dice, then the token square by square, then settles on the server state", async () => {
    const g0 = makeRoom({ first: "red", settings: { autoMove: false }, tokens: { red: [5, 20, BASE, BASE] } }).ludo.game!;
    const { result, rerender } = setup(g0);

    const g1 = engine.roll(g0, idOf("red"), { rng: rngOf(3), now: 0 });
    rerender({ g: g1 });
    expect(result.current.view.stage).toBe("rolling");
    expect(result.current.view.dice?.value).toBe(3);
    // Nothing moves until the dice says it has settled
    await advance(500);
    expect(result.current.view.stage).toBe("rolling");
    act(() => result.current.onDiceSettled());
    await advance(10);
    expect(result.current.view.stage).toBe("idle");

    const g2 = engine.move(g1, idOf("red"), 0, { now: 0 });
    rerender({ g: g2 });
    expect(result.current.view.stage).toBe("moving");
    expect(result.current.view.movingToken).toBe("red-0");
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      await advance(0);
      seen.push(result.current.view.tokens.red![0]);
      await advance(190);
    }
    expect(seen).toEqual([6, 7, 8]);
    await advance(1000);
    expect(result.current.view.stage).toBe("idle");
    expect(result.current.view.tokens).toEqual(g2.tokens);
  });

  it("sends captured tokens home and announces the capture", async () => {
    // red square 5 -> 9 lands on yellow (yellow progress 35 = square 9)
    const g0 = makeRoom({ first: "red", tokens: { red: [5, 56, 56, 56], yellow: [35, BASE, BASE, BASE] } }).ludo.game!;
    const { result, rerender } = setup(g0);
    const g1 = engine.roll(g0, idOf("red"), { rng: rngOf(4), now: 0 }); // single choice: auto-move
    expect(g1.events.slice(-2).map((e) => e.type)).toEqual(["roll", "move"]);
    rerender({ g: g1 });
    act(() => result.current.onDiceSettled());
    await advance(4 * 190 + 50);
    expect(result.current.view.tokens.yellow![0]).toBe(BASE);
    expect(result.current.view.capturedTokens).toEqual(["yellow-0"]);
    expect(result.current.notice?.text).toBe("You captured Yellow!");
    await advance(900);
    expect(result.current.notice?.text).toBe("Capture bonus — roll again!");
    await advance(1000);
    expect(result.current.view.stage).toBe("idle");
    expect(result.current.view.tokens).toEqual(g1.tokens);
  });

  it("falls back to the server state if the dice never reports back", async () => {
    const g0 = makeRoom({ first: "red" }).ludo.game!;
    const { result, rerender } = setup(g0);
    rerender({ g: engine.roll(g0, idOf("red"), { rng: rngOf(2), now: 0 }) });
    expect(result.current.view.stage).toBe("rolling");
    await advance(5000);
    expect(result.current.view.stage).toBe("idle");
  });

  it("skips straight to the latest state when it has fallen behind", async () => {
    let g = makeRoom({ first: "red", settings: { autoMove: false } }).ludo.game!;
    const { result, rerender } = setup(g);
    // Ten no-move rolls arrive at once (e.g. after being offline)
    for (let i = 0; i < 10; i++) g = engine.roll(g, g.players.find((p) => p.color === g.turn.color)!.id, { rng: rngOf(2), now: 0 });
    rerender({ g });
    expect(result.current.view.stage).toBe("idle");
    expect(result.current.view.tokens).toEqual(g.tokens);
  });

  it("resets for a new game", () => {
    const first = makeRoom({ tokens: { red: [30, 40, BASE, BASE] } }).ludo.game!;
    const { result, rerender } = setup(first);
    const next = makeRoom().ludo.game!;
    rerender({ g: next });
    expect(result.current.view.tokens.red).toEqual([BASE, BASE, BASE, BASE]);
    expect(result.current.view.stage).toBe("idle");
  });

  it("announces the local player's turn once", async () => {
    const g0 = makeRoom({ first: "yellow" }).ludo.game!;
    const { result, rerender } = setup(g0);
    const g1 = engine.roll(g0, idOf("yellow"), { rng: rngOf(2), now: 0 }); // no move -> red's turn
    rerender({ g: g1 });
    act(() => result.current.onDiceSettled());
    await advance(1500);
    expect(result.current.notice?.text).toBe("Your turn — roll the dice!");
  });
});
