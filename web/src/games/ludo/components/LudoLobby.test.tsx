import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginScreen from "../../../components/LoginScreen";
import { idOf, makeLobby } from "../test/fixtures";
import LudoLobby from "./LudoLobby";

function lobby(room: ReturnType<typeof makeLobby>, me: string) {
  const act = vi.fn(async () => true);
  const onLeave = vi.fn();
  render(<LudoLobby room={room} playerId={me} pending={null} act={act} onLeave={onLeave} />);
  return { act, onLeave };
}

describe("LudoLobby", () => {
  it("shows the code, seats, empty slots and why the game can't start yet", () => {
    lobby(makeLobby([{ color: "red", ready: true }, { color: "yellow", ready: false }], 3), idOf("red"));
    expect(screen.getByText("1234")).toBeTruthy();
    expect(screen.getByText("Alice (You)")).toBeTruthy();
    expect(screen.getByText("Red — Player 1")).toBeTruthy();
    expect(screen.getByText("Yellow — Player 2")).toBeTruthy();
    expect(screen.getByText("HOST")).toBeTruthy();
    expect(screen.getByText("Not ready")).toBeTruthy();
    expect(screen.getAllByText("Waiting for a player…")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Start game" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Waiting for 1 more player to join")).toBeTruthy();
  });

  it("lets the host start once every seat is filled and ready", () => {
    const { act } = lobby(makeLobby([{ color: "red", ready: true }, { color: "yellow", ready: true }], 2), idOf("red"));
    const start = screen.getByRole("button", { name: "Start game" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(act).toHaveBeenCalledWith({ type: "start" });
  });

  it("lets the host choose the number of players, never below who's already here", () => {
    const { act } = lobby(makeLobby([{ color: "red", ready: true }, { color: "green", ready: true }, { color: "yellow", ready: false }], 4), idOf("red"));
    expect((screen.getByRole("radio", { name: "2 players" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: "4 players" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "3 players" }));
    expect(act).toHaveBeenCalledWith({ type: "settings", maxPlayers: 3 });
  });

  it("lets a guest get ready and pick a free colour", () => {
    const { act, onLeave } = lobby(makeLobby([{ color: "red", ready: true }, { color: "yellow", ready: false }], 2), idOf("yellow"));
    expect(screen.queryByRole("button", { name: "Start game" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "3 players" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I'm ready" }));
    expect(act).toHaveBeenCalledWith({ type: "ready", ready: true });
    expect((screen.getByRole("radio", { name: "Red, taken by Alice" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    expect(act).toHaveBeenCalledWith({ type: "color", color: "blue" });
    fireEvent.click(screen.getByRole("button", { name: "Leave room" }));
    expect(onLeave).toHaveBeenCalled();
  });
});

describe("join screen game switch", () => {
  const props = {
    ready: true,
    playerName: "Alice",
    setPlayerName: () => {},
    joinId: "",
    setJoinId: () => {},
    error: "",
    loading: false,
    onCreateRoom: () => {},
    onJoinRoom: () => {},
  };

  it("keeps Snakes & Ladders as it was and switches to Ludo", () => {
    const setGame = vi.fn();
    const { rerender } = render(<LoginScreen {...props} game="snakes" setGame={setGame} />);
    expect(screen.getByRole("radio", { name: "Snakes & Ladders" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Create room" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Ludo" }));
    expect(setGame).toHaveBeenCalledWith("ludo");
    rerender(<LoginScreen {...props} game="ludo" setGame={setGame} />);
    expect(screen.getByRole("button", { name: "Create Ludo room" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ludo");
  });
});
