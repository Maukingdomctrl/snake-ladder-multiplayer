import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LudoBoard from "./LudoBoard";

const base = {
  size: 450,
  colorsInPlay: ["red", "yellow"] as const,
  tokens: { red: [-1, 5, 56, -1], yellow: [-1, -1, -1, 12] },
  turnColor: "red" as const,
  myColor: "red" as const,
  selectable: null,
  focusToken: null,
  movingToken: null,
  capturedTokens: [],
  homeToken: null,
  names: { red: "Alice (You)", yellow: "Bob" },
  safeSquares: true,
  onPick: () => {},
};

describe("LudoBoard", () => {
  it("draws the board and every token in play with an accessible description", () => {
    const { container } = render(<LudoBoard {...base} />);
    expect(screen.getByRole("group", { name: "Ludo board" })).toBeTruthy();
    expect(container.querySelectorAll(".ludo-token")).toHaveLength(8);
    expect(screen.getByLabelText("Red token 2, 51 squares from home")).toBeTruthy();
    expect(screen.getByLabelText("Red token 3, home")).toBeTruthy();
    expect(screen.getByLabelText("Yellow token 4, 44 squares from home")).toBeTruthy();
    // 4 star squares + 4 start squares are marked safe
    expect(container.querySelectorAll("svg polygon[points]").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText("Alice (You)")).toBeTruthy();
  });

  it("only the server's legal tokens can be picked; others are inactive", () => {
    const onPick = vi.fn();
    render(<LudoBoard {...base} selectable={[1]} onPick={onPick} />);
    const legal = screen.getByLabelText("Red token 2, 51 squares from home, can move") as HTMLButtonElement;
    const other = screen.getByLabelText("Red token 1, in base") as HTMLButtonElement;
    expect(legal.disabled).toBe(false);
    expect(legal.tabIndex).toBe(0); // reachable by keyboard
    expect(legal.className).toContain("is-legal");
    expect(other.disabled).toBe(true);
    expect(other.tabIndex).toBe(-1);
    expect(other.className).toContain("is-dim");
    fireEvent.click(other);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(legal); // a tap is a click
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("never offers an opponent's tokens", () => {
    render(<LudoBoard {...base} selectable={[3]} />);
    expect((screen.getByLabelText("Yellow token 4, 44 squares from home") as HTMLButtonElement).disabled).toBe(true);
  });

  it("marks moving, captured and highlighted tokens for their animations", () => {
    const { container } = render(
      <LudoBoard {...base} selectable={[1]} focusToken={1} movingToken="red-1" capturedTokens={["yellow-3"]} />
    );
    expect(container.querySelector('[data-token="red-1"]')!.className).toContain("is-moving");
    expect(container.querySelector('[data-token="red-1"]')!.className).toContain("is-focus");
    expect(container.querySelector('[data-token="yellow-3"]')!.className).toContain("is-captured");
  });

  it("highlights the yard of the player whose turn it is", () => {
    const { container } = render(<LudoBoard {...base} turnColor="yellow" />);
    const glow = container.querySelector(".ludo-turn-glow") as HTMLElement;
    expect(glow).toBeTruthy();
    expect(glow.style.getPropertyValue("--glow")).toBe("#f2c21b");
  });
});
