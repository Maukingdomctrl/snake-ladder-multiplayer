import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginScreen, { type LoginScreenProps } from "../LoginScreen";

function props(overrides: Partial<LoginScreenProps> = {}): LoginScreenProps {
  return {
    ready: true,
    playerName: "Alice",
    setPlayerName: vi.fn(),
    joinId: "",
    setJoinId: vi.fn(),
    error: "",
    loading: false,
    onCreateRoom: vi.fn(),
    onJoinRoom: vi.fn(),
    game: "snakes",
    setGame: vi.fn(),
    ...overrides,
  };
}

function setWindow(width: number, height: number, finePointer: boolean) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.matchMedia = ((query: string) => ({ matches: finePointer, media: query })) as typeof window.matchMedia;
}

afterEach(() => {
  setWindow(1024, 768, false);
});

describe("home page on phones", () => {
  it("puts the room card where LoginScreen measured it (the keyboard never moves it)", () => {
    setWindow(412, 820, false);
    const { container } = render(<LoginScreen {...props()} />);
    expect(container.querySelector(".gaming-home--mobile")).toBeTruthy();
    // 412×820: keyboard top ≈ 370px, card from 70px, at least 300px tall
    expect((container.querySelector(".gh-m-shell") as HTMLElement).style.paddingTop).toBe("70px");
    expect((container.querySelector(".gh-m-card") as HTMLElement).style.minHeight).toBe("300px");
  });

  it("lets you type while connecting but waits to create or join", () => {
    setWindow(360, 700, false);
    render(<LoginScreen {...props({ ready: false })} />);
    expect(screen.getByRole("status").textContent).toBe("Connecting…");
    expect((screen.getByPlaceholderText("Your name") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Create room" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Join" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps digits only in the room code and joins on Enter", () => {
    setWindow(360, 700, false);
    const p = props({ joinId: "1234" });
    render(<LoginScreen {...p} />);
    const code = screen.getByPlaceholderText("Room code");
    fireEvent.change(code, { target: { value: "12a3" } });
    expect(p.setJoinId).toHaveBeenCalledWith("123");
    fireEvent.submit(code.closest("form")!);
    expect(p.onJoinRoom).toHaveBeenCalledTimes(1);
  });

  it("creates on Enter in the name field and shows errors", () => {
    setWindow(360, 700, false);
    const p = props({ error: "Room not found" });
    render(<LoginScreen {...p} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Your name"), { key: "Enter" });
    expect(p.onCreateRoom).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe("Room not found");
  });
});

describe("home page on desktop", () => {
  it("shows the desktop layout for a wide window with a mouse", () => {
    setWindow(1440, 900, true);
    const { container } = render(<LoginScreen {...props()} />);
    expect(container.querySelector(".gaming-home--desktop")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Old-school games.New memories.");
  });

  it("keeps the phone layout on a wide touch screen", () => {
    setWindow(1366, 1024, false);
    const { container } = render(<LoginScreen {...props()} />);
    expect(container.querySelector(".gaming-home--mobile")).toBeTruthy();
  });
});
