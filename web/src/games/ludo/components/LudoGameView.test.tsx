import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observedSize } from "../../../test/setup";
import { engine, idOf, makeRoom, rngOf, roomWith } from "../test/fixtures";
import type { LudoRoom } from "../types";
import LudoGameView from "./LudoGameView";

function view(room: LudoRoom, me: string, act = vi.fn(async () => true)) {
  const onLeave = vi.fn();
  render(
    <LudoGameView
      room={room}
      playerId={me}
      pending={null}
      act={act}
      onLeave={onLeave}
      serverNow={() => Date.now()}
      sound={false}
      onToggleSound={() => {}}
    />
  );
  return { act, onLeave };
}

beforeEach(() => {
  observedSize.width = 400;
  observedSize.height = 760;
});

describe("LudoGameView", () => {
  it("tells the player it's their turn and lets them roll", () => {
    const { act } = view(makeRoom({ first: "red" }), idOf("red"));
    expect(screen.getByText(/Your turn/, { selector: ".ludo-banner__text" })).toBeTruthy();
    const roll = screen.getByRole("button", { name: "Roll the dice" }) as HTMLButtonElement;
    expect(roll.disabled).toBe(false);
    fireEvent.click(roll);
    expect(act).toHaveBeenCalledWith({ type: "roll" }, { versioned: true });
  });

  it("disables the dice and names the current player on someone else's turn", () => {
    view(makeRoom({ first: "red" }), idOf("yellow"));
    expect(screen.getByText("Alice's turn", { exact: false, selector: ".ludo-banner__text" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Roll the dice" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Alice is rolling…")).toBeTruthy();
  });

  it("offers the legal tokens as large buttons and on the board", () => {
    const start = makeRoom({ first: "red", settings: { autoMove: false }, tokens: { red: [5, 20, -1, -1] } });
    const rolled = roomWith(engine.roll(start.ludo.game!, idOf("red"), { rng: rngOf(3), now: 0 }));
    const { act } = view(rolled, idOf("red"));
    expect(screen.getByText("Move 3 — pick:")).toBeTruthy();
    const picks = screen.getAllByRole("button", { name: /^Move token/ });
    expect(picks.map((b) => b.textContent)).toEqual(["1", "2"]);
    expect(screen.getAllByLabelText(/can move$/)).toHaveLength(2);
    fireEvent.click(picks[1]);
    expect(act).toHaveBeenCalledWith({ type: "move", token: 1 }, { versioned: true });
    expect((screen.getByRole("button", { name: "Roll the dice" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks before forfeiting and then leaves", () => {
    const { onLeave } = view(makeRoom({ first: "red" }), idOf("red"));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Forfeit?" }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("shows the winner with play-again for the host", () => {
    const room = makeRoom({ first: "red" });
    const over = roomWith(engine.removePlayer(room.ludo.game!, idOf("yellow"), "left", { now: 0 }), { hostColor: "red" });
    const { act } = view(over, idOf("red"));
    expect(screen.getByText("Winner")).toBeTruthy();
    expect(screen.getByText("Alice (Red)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play Again" }));
    expect(act).toHaveBeenCalledWith({ type: "restart" });
  });

  it("lists every player with colour, name and number", () => {
    view(makeRoom({ colors: ["red", "green", "yellow", "blue"], first: "green" }), idOf("blue"));
    const list = screen.getByRole("list", { name: "Players" });
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(4);
    expect(items[0].getAttribute("aria-label")).toBe("Red — Player 1, Alice, 0/4 home");
    expect(items[1].getAttribute("aria-current")).toBe("true");
    expect(items[3].getAttribute("aria-label")).toContain("Bea (You)");
  });

  it("uses a stacked layout on phones and a side panel on wide screens", () => {
    view(makeRoom(), idOf("red"));
    expect(document.querySelector(".ludo-game")!.className).not.toContain("is-wide");
    expect(document.querySelector(".ludo-panel")).toBeNull();
  });

  it("moves the controls into a side panel on wide screens", () => {
    observedSize.width = 1100;
    observedSize.height = 760;
    view(makeRoom(), idOf("red"));
    expect(document.querySelector(".ludo-game")!.className).toContain("is-wide");
    expect(document.querySelector(".ludo-panel .ludo-dice")).toBeTruthy();
  });
});
