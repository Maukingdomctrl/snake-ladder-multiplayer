import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LudoRoom } from "./types";

// The network layer is replaced so these tests control every reply.
const api = vi.hoisted(() => {
  class LudoApiError extends Error {
    code: string;
    status: number;
    retryInMs?: number;
    constructor(code: string, message: string, status: number, extra: { retryInMs?: number } = {}) {
      super(message);
      this.code = code;
      this.status = status;
      this.retryInMs = extra.retryInMs;
    }
  }
  return {
    LudoApiError,
    sendLudoAction: vi.fn(),
    subscribeLudoRoom: vi.fn(),
    listener: null as null | ((room: LudoRoom | null, fromCache: boolean) => void),
  };
});
vi.mock("./api", () => ({
  LudoApiError: api.LudoApiError,
  sendLudoAction: api.sendLudoAction,
  subscribeLudoRoom: api.subscribeLudoRoom,
}));

import { makeRoom, idOf } from "./test/fixtures";
import { useLudoRoom } from "./useLudoRoom";

const reply = (room: LudoRoom, serverTime = Date.now()) => ({
  reply: { roomId: room.id, room, serverTime },
  sentAt: Date.now(),
  receivedAt: Date.now(),
});

function withVersion(version: number, tweak: (r: LudoRoom) => void = () => {}) {
  const r = makeRoom({ first: "red" });
  r.version = version;
  tweak(r);
  return r;
}

function setup(roomId = "1234", onExit = vi.fn()) {
  const hook = renderHook(() => useLudoRoom({ roomId, playerId: idOf("red"), playerName: "Alice", onExit }));
  return { ...hook, onExit };
}

beforeEach(() => {
  api.sendLudoAction.mockReset();
  api.subscribeLudoRoom.mockReset();
  api.subscribeLudoRoom.mockImplementation((_id: string, onRoom: typeof api.listener) => {
    api.listener = onRoom;
    return () => {};
  });
});
afterEach(() => vi.useRealTimers());

describe("useLudoRoom", () => {
  it("rejoins on entry and shows the server's reply", async () => {
    const room = withVersion(5);
    api.sendLudoAction.mockResolvedValue(reply(room));
    const { result } = setup();
    await act(async () => {});
    expect(api.sendLudoAction).toHaveBeenCalledWith("1234", { type: "join", name: "Alice" });
    expect(result.current.room?.version).toBe(5);
  });

  it("ignores stale, duplicate and out-of-order snapshots", async () => {
    api.sendLudoAction.mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    act(() => api.listener!(withVersion(7), false));
    expect(result.current.room?.version).toBe(7);
    const older = withVersion(6, (r) => (r.status = "finished"));
    act(() => api.listener!(older, false));
    expect(result.current.room?.version).toBe(7);
    expect(result.current.room?.status).toBe("playing");
    const first = result.current.room;
    act(() => api.listener!(withVersion(7), false));
    expect(result.current.room).toBe(first);
    act(() => api.listener!(withVersion(9), false));
    expect(result.current.room?.version).toBe(9);
  });

  it("leaves the room screen when the room is gone or can't be joined", async () => {
    api.sendLudoAction.mockRejectedValue(new api.LudoApiError("ROOM_FULL", "This room is full.", 409));
    const { onExit } = setup();
    await act(async () => {});
    expect(onExit).toHaveBeenCalledWith("This room is full.");

    api.sendLudoAction.mockReturnValue(new Promise(() => {}));
    const second = setup("5678");
    act(() => api.listener!(withVersion(3), false));
    act(() => api.listener!(null, false));
    expect(second.onExit).toHaveBeenCalledWith("This room no longer exists.");
  });

  it("stays in the room when the server is merely unreachable", async () => {
    api.sendLudoAction.mockRejectedValue(new api.LudoApiError("NETWORK", "Couldn't reach the game server.", 0));
    const { result, onExit } = setup();
    await act(async () => {});
    expect(onExit).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Couldn't reach the game server.");
  });

  it("sends the version it decided on for game moves only", async () => {
    const room = withVersion(4);
    api.sendLudoAction.mockResolvedValue(reply(room));
    const { result } = setup();
    await act(async () => {});
    await act(() => result.current.act({ type: "roll" }, { versioned: true }));
    expect(api.sendLudoAction).toHaveBeenLastCalledWith("1234", { type: "roll" }, 4);
    await act(() => result.current.act({ type: "ready", ready: true }));
    expect(api.sendLudoAction).toHaveBeenLastCalledWith("1234", { type: "ready", ready: true }, undefined);
  });

  it("shows why an action was refused", async () => {
    api.sendLudoAction.mockResolvedValueOnce(reply(withVersion(4)));
    const { result } = setup();
    await act(async () => {});
    api.sendLudoAction.mockRejectedValueOnce(new api.LudoApiError("NOT_YOUR_TURN", "It is not your turn.", 409));
    let ok = true;
    await act(async () => {
      ok = await result.current.act({ type: "roll" }, { versioned: true });
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe("It is not your turn.");
  });

  it("asks the server to resolve the turn once its deadline passes, retrying if early", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const room = withVersion(8, (r) => (r.ludo.game!.turn.deadline = now + 5000));
    api.sendLudoAction.mockResolvedValueOnce(reply(room, now));
    setup();
    await act(async () => {});
    api.sendLudoAction.mockRejectedValueOnce(new api.LudoApiError("TOO_EARLY", "Not yet", 409, { retryInMs: 400 }));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(api.sendLudoAction).toHaveBeenCalledTimes(1); // only the join so far
    await act(() => vi.advanceTimersByTimeAsync(1300));
    expect(api.sendLudoAction).toHaveBeenLastCalledWith("1234", { type: "timeout" }, 8);
    const calls = api.sendLudoAction.mock.calls.length;
    api.sendLudoAction.mockResolvedValueOnce(reply(withVersion(9)));
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(api.sendLudoAction.mock.calls.length).toBe(calls + 1);
  });

  it("does nothing without a room", () => {
    renderHook(() => useLudoRoom({ roomId: "", playerId: "x", playerName: "X", onExit: () => {} }));
    expect(api.sendLudoAction).not.toHaveBeenCalled();
    expect(api.subscribeLudoRoom).not.toHaveBeenCalled();
  });
});
