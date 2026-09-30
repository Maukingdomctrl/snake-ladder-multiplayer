import { describe, expect, it } from "vitest";
import { deriveUiPhase, lobbyPhase, seatLabel } from "./state";
import { engine, idOf, makeLobby, makeRoom, rngOf, roomWith } from "./test/fixtures";

describe("lobby phase", () => {
  it("waits for players, then for ready, then is ready", () => {
    expect(lobbyPhase(makeLobby([{ color: "red", ready: true }], 2))).toBe("waiting-for-players");
    expect(lobbyPhase(makeLobby([{ color: "red", ready: true }, { color: "yellow", ready: false }], 2))).toBe("waiting-for-ready");
    expect(lobbyPhase(makeLobby([{ color: "red", ready: true }, { color: "yellow", ready: true }], 2))).toBe("ready");
  });
});

describe("UI phase", () => {
  const room = makeRoom({ first: "red", settings: { autoMove: false }, tokens: { red: [5, 20, -1, -1] } });

  it("is my roll / their turn depending on who asks", () => {
    expect(deriveUiPhase(room, idOf("red"), "idle", null)).toEqual({ kind: "my-roll" });
    expect(deriveUiPhase(room, idOf("yellow"), "idle", null)).toEqual({ kind: "their-turn", color: "red", phase: "roll" });
  });

  it("offers exactly the server's legal tokens after a roll", () => {
    const rolled = roomWith(engine.roll(room.ludo.game!, idOf("red"), { rng: rngOf(3), now: 0 }));
    expect(deriveUiPhase(rolled, idOf("red"), "idle", null)).toEqual({ kind: "my-move", legal: [0, 1], dice: 3 });
  });

  it("never lets a player act while an animation is playing", () => {
    expect(deriveUiPhase(room, idOf("red"), "rolling", "red")).toEqual({ kind: "animating", color: "red" });
    expect(deriveUiPhase(room, idOf("red"), "moving", "red").kind).toBe("animating");
  });

  it("shows a removed player as a spectator and a finished game as finished", () => {
    const left = roomWith(engine.removePlayer(makeRoom({ colors: ["red", "green", "yellow"] }).ludo.game!, idOf("green"), "left", { now: 0 }));
    expect(deriveUiPhase(left, idOf("green"), "idle", null)).toEqual({ kind: "spectating" });
    const over = roomWith(engine.removePlayer(room.ludo.game!, idOf("yellow"), "left", { now: 0 }));
    expect(deriveUiPhase(over, idOf("red"), "idle", null)).toEqual({ kind: "finished", winnerId: idOf("red") });
  });

  it("labels seats with colour and number, not colour alone", () => {
    expect(seatLabel("blue", 4)).toBe("Blue — Player 4");
  });
});
