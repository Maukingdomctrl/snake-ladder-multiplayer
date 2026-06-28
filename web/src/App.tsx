// web/src/App.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase/index";
import "./App.css";

import {
  createRoom,
  joinRoom,
  leaveRoom,
  subscribeRoom,
  startGame,
  rollDice,
  subscribeMessages,
  Room,
  RoomMessage, // ★ STRICT TS: Imported RoomMessage
} from "./firebase/rooms";

import { usePlayerStorage } from "./hooks/usePlayerStorage";
import { useGameSync } from "./hooks/useGameSync";
import { useWindowDimensions } from "./hooks/useWindowDimensions";

import Board from "./components/Board";
import LoginScreen from "./components/LoginScreen";
import Lobby from "./components/Lobby";
import Chat from "./components/Chat";
import GameHeader from "./components/GameHeader";
import CountdownCard from "./components/CountdownCard";
import Scoreboard from "./components/Scoreboard";
import WinnerOverlay from "./components/WinnerOverlay";
import DiceRow from "./components/DiceRow";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

// BUG FIX (pieces appear to move while the dice is still visually settling):
// This fallback timeout exists purely as a safety net in case Dice.tsx's
// `onRollComplete` callback never fires (e.g. the component unmounts mid
// animation, or some other edge case). Dice.tsx's real completion path now
// takes ROLL_MS (4500ms) + a settle buffer (250ms) = 4750ms. This fallback
// previously fired at 5000ms, leaving only 250ms of margin — on a slow
// device, backgrounded tab, or any frame jank, the fallback could fire
// BEFORE Dice.tsx's real completion, forcibly setting diceComplete to true
// while the dice was still visibly mid-roll. Widened to 6000ms so the
// fallback can never race the real completion signal under normal
// conditions, while still recovering within a reasonable time if the real
// signal is genuinely lost.
const DICE_FALLBACK_TIMEOUT_MS = 6000;

// Stable, shared fallback objects — using `|| {}` inline creates a brand
// new object reference on every render whenever the underlying field is
// absent, which silently defeats React.memo on any child receiving that
// prop. These are frozen module-level constants instead, so the fallback
// reference never changes across renders.
const EMPTY_PLAYER_MAP: Record<string, string> = Object.freeze({});
const EMPTY_PLAYERS_LIST: string[] = Object.freeze([] as string[]) as string[];

export default function App() {
  const { playerId, playerName, setPlayerName, playerColor, setPlayerColor } = usePlayerStorage();
  const { width, height } = useWindowDimensions();

  const isTablet = width >= 768;
  const isCompact = height < 700;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [joinId, setJoinId] = useState<string>("");
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  // Mirrors activeRoomId via a ref so callbacks created in an OLDER
  // effect closure (e.g. a Firestore snapshot listener from a room the
  // user has since left) can check the TRUE current value at the moment
  // they fire, rather than a value captured when that closure was
  // created — comparing against a same-closure capture would always be
  // trivially true and never actually catch a stale callback.
  const activeRoomIdRef = useRef<string>("");
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);
  // BUG FIX: tracks whether THIS room has ever delivered real (non-null)
  // data. Lets the snapshot callback distinguish "still loading for the
  // first time" (room === null is expected and already shows "Loading
  // room...") from "the room existed and just got deleted out from under
  // us" (room === null AFTER having real data) — the latter previously
  // left the user stuck on the loading screen indefinitely with no way
  // back to the login screen.
  const hasLoadedRoomDataRef = useRef<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [roomData, setRoomData] = useState<Room | null>(null);
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>({});
  const [jumpMessage, setJumpMessage] = useState<string>("");
  const [diceComplete, setDiceComplete] = useState<boolean>(true);
  const { countdown } = useGameSync(roomData, playerId);

  // ★ STRICT TS: Removed any[]
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [chatOpen, setChatOpen] = useState<boolean>(isTablet);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // ★ Board container measurement
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardDims, setBoardDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // ★ Mobile keyboard tracking
  const drawerRef = useRef<HTMLDivElement>(null);

  const prevRoomRef = useRef<Room | null>(null);
  const lastProcessedMoveRef = useRef<string>("");
  const prevMsgCountRef = useRef<number>(0);
  const isFirstMessageLoadRef = useRef<boolean>(true);
  const diceFinishedRef = useRef<boolean>(true);
  // BUG FIX: synchronous guard against a rapid double-tap on "Join Room."
  // React state updates (setLoading(true)) are asynchronous, so two
  // click events fired in quick succession can both pass the `loading`
  // check before the button visually disables. A plain ref mutation is
  // synchronous and closes that window completely.
  const joiningRef = useRef<boolean>(false);
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BUG FIX (Bug 5: loading stuck forever on network failure): if
  // Firestore queues the write offline instead of throwing (its default
  // behavior when the device has no connection), rollDice's await never
  // rejects and handleRollComplete never fires — loading stays true
  // forever, permanently disabling the roll button. This ref tracks a
  // fallback timeout that force-clears loading after a generous window,
  // mirroring the existing observerTimeoutRef pattern. It's tracked (not
  // a bare setTimeout) so a normal, fast completion via
  // handleRollComplete can clear it before it fires, and so a rapid
  // re-roll can't leave multiple stray timers stacked.
  const rollFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJumpMessageRef = useRef<string>("");
  const pendingPositionsRef = useRef<Record<string, number>>({});

  // ★ ResizeObserver for board container
  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver((entries) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setBoardDims({ width: Math.floor(width), height: Math.floor(height) });
          }
        }
      }, 50);
    });

    ro.observe(el);

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setBoardDims({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    }

    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
  }, [roomData?.status]);

  // ★ VisualViewport keyboard detection for mobile drawer
  useEffect(() => {
    if (isTablet || !chatOpen) return;

    const vv = window.visualViewport;
    if (!vv) return;

    let rafId = 0;
    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const kh = window.innerHeight - vv.height - vv.offsetTop;
        const drawer = drawerRef.current;
        if (!drawer) return;
        if (kh > 50) {
          drawer.style.bottom = `${kh}px`;
          drawer.style.height = `${(window.innerHeight - kh) * 0.85}px`;
          drawer.classList.add('keyboard-active');
        } else {
          drawer.style.bottom = '';
          drawer.style.height = '';
          drawer.classList.remove('keyboard-active');
        }
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      cancelAnimationFrame(rafId);
      // BUG FIX: without this, a teardown triggered by isTablet flipping
      // true (rather than the user explicitly closing the drawer via
      // closeChatDrawer) leaves drawerRef stuck with whatever inline
      // bottom/height/keyboard-active state it last had while the
      // keyboard was open.
      const drawer = drawerRef.current;
      if (drawer) {
        drawer.style.bottom = '';
        drawer.style.height = '';
        drawer.classList.remove('keyboard-active');
      }
    };
  }, [isTablet, chatOpen]);

  // ★ Lock body scroll when mobile chat drawer is open
  useEffect(() => {
    if (chatOpen && !isTablet) {
      const prev = document.body.style.overflow;
      const prevTouch = document.body.style.overscrollBehavior;
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
      return () => {
        document.body.style.overflow = prev;
        document.body.style.overscrollBehavior = prevTouch;
      };
    }
  }, [chatOpen, isTablet]);

  useEffect(() => {
    if (isTablet) {
      setChatOpen(true);
    } else {
      setChatOpen(false);
    }
  }, [isTablet]);

  useEffect(() => {
    return () => {
      if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
      // BUG FIX: rollFallbackTimeoutRef (the 8s failsafe armed in
      // onRollDice) was never cleared on unmount, only observerTimeoutRef
      // was. The 8s timer could survive a component unmount (route
      // change, or a Strict Mode dev double-mount) and later fire
      // setLoading(false) on a dead component — a real leak, though
      // harmless to gameplay since nothing was listening anymore.
      if (rollFallbackTimeoutRef.current) clearTimeout(rollFallbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // Bug 1 fix: the previous version returned early when
    // messages.length === 0, which meant a brand-new room's very first
    // (empty) snapshot never got a chance to consume
    // isFirstMessageLoadRef.current. The flag was still sitting at
    // `true` when the first REAL message arrived moments later, so that
    // message's snapshot was mistaken for "the initial load" and its
    // unread count was silently skipped. Removing the early return lets
    // every snapshot — even an empty one — correctly consume the flag,
    // so by the time any real message arrives, isFirstMessageLoadRef is
    // already false and the unread-counting branch runs as expected.
    if (isFirstMessageLoadRef.current) {
      isFirstMessageLoadRef.current = false;
    } else if (!chatOpen && !isTablet && messages.length > prevMsgCountRef.current) {
      const newMessages = messages.slice(prevMsgCountRef.current);
      const othersMessages = newMessages.filter((m) => m.playerId !== playerId);
      if (othersMessages.length > 0) {
        setUnreadCount((prev) => prev + othersMessages.length);
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, chatOpen, isTablet, playerId]);

  useEffect(() => {
    if (chatOpen || isTablet) setUnreadCount(0);
  }, [chatOpen, isTablet]);

  const isMyTurn =
    roomData?.status === "playing" && roomData?.currentTurn === playerId && diceComplete;
  const getName = (pid: string) => roomData?.playerNames?.[pid] || pid;
  const displayTurnId = diceComplete ? roomData?.currentTurn : roomData?.lastRolledBy;
  const currentTurnName = displayTurnId ? getName(displayTurnId) : "";

  const handleRollComplete = useCallback(() => {
    diceFinishedRef.current = true;
    if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
    if (rollFallbackTimeoutRef.current) clearTimeout(rollFallbackTimeoutRef.current);

    setDiceComplete(true);
    setJumpMessage(pendingJumpMessageRef.current);

    if (Object.keys(pendingPositionsRef.current).length > 0) {
      setDisplayPositions(pendingPositionsRef.current);
    }

    setLoading(false);
  }, []);

  const onPickColor = async (color: string) => {
    setPlayerColor(color);
    if (activeRoomId) {
      try {
        await updateDoc(doc(db, "rooms", activeRoomId), {
          [`playerColors.${playerId}`]: color,
        });
      } catch (err) {
        console.error("Failed to update color:", err);
      }
    }
  };

  const onCreateRoom = async () => {
    if (!playerName.trim()) return setError("Please enter your name first");
    setLoading(true);
    setError("");
    try {
      const id = await createRoom(playerId, playerName.trim(), playerColor);
      setActiveRoomId(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  const onJoinRoom = async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setError("");
    const trimmedId = joinId.trim();
    if (trimmedId.length !== 4) {
      joiningRef.current = false;
      return setError("Room code must be exactly 4 digits");
    }
    if (!playerName.trim()) {
      joiningRef.current = false;
      return setError("Please enter your name first");
    }

    setLoading(true);
    try {
      await joinRoom(trimmedId, playerId, playerName.trim(), playerColor);
      setActiveRoomId(trimmedId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join room");
    } finally {
      setLoading(false);
      joiningRef.current = false;
    }
  };

  const onStartGame = async () => {
    if (!activeRoomId) return;
    setLoading(true);
    setError("");
    try {
      await startGame(activeRoomId, playerId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start game");
    } finally {
      setLoading(false);
    }
  };

  const onRollDice = async () => {
    if (!activeRoomId) return;
    setLoading(true);
    setError("");
    try {
      await rollDice(activeRoomId, playerId);
      // Failsafe: if the game sync (handleRollComplete) never fires —
      // e.g. the write got queued offline instead of erroring — force
      // the roll button back to usable after a generous window. Cleared
      // by handleRollComplete on normal completion, and any previous
      // pending instance is cleared here first so rapid re-rolls can't
      // stack multiple stray timers.
      if (rollFallbackTimeoutRef.current) clearTimeout(rollFallbackTimeoutRef.current);
      rollFallbackTimeoutRef.current = setTimeout(() => {
        rollFallbackTimeoutRef.current = null;
        setLoading(false);
      }, 8000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to roll dice");
      setLoading(false);
    }
  };

  const onLeaveRoom = async () => {
    setError("");
    setMessages([]);
    // BUG FIX: leaving mid-roll (loading=true, rollFallbackTimeoutRef
    // armed) previously left both stranded. Nothing resets `loading` on
    // the leave path — the activeRoomId effect's reset block only runs
    // when JOINING a room (it early-returns while activeRoomId is
    // falsy, which is exactly what this function sets it to), and even
    // then it never touched `loading`. A player who left mid-roll and
    // then joined a new room could find the new room's roll button
    // already disabled, with recovery depending entirely on whether the
    // orphaned 8s timer happened to still be alive and correctly timed.
    setLoading(false);
    if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
    if (rollFallbackTimeoutRef.current) clearTimeout(rollFallbackTimeoutRef.current);
    if (activeRoomId) {
      try {
        await leaveRoom(activeRoomId, playerId);
      } catch (err) {
        console.error("Failed to cleanly leave room:", err);
      }
    }
    setActiveRoomId("");
    setRoomData(null);
    setJoinId("");
  };

  // ── Firestore Sync & Position Logic ──
  useEffect(() => {
    if (!activeRoomId) return;

    setJumpMessage("");
    prevRoomRef.current = null;
    lastProcessedMoveRef.current = "";
    setDisplayPositions({});
    isFirstMessageLoadRef.current = true;
    prevMsgCountRef.current = 0;
    setUnreadCount(0);

    setMessages([]);
    pendingJumpMessageRef.current = "";
    pendingPositionsRef.current = {};
    diceFinishedRef.current = true;
    setDiceComplete(true);
    hasLoadedRoomDataRef.current = false;

    // BUG FIX: guard the callback against firing after activeRoomId has
    // already moved on (rapid leave-then-join). unsub() stops FUTURE
    // callbacks, but a callback already in flight from the network when
    // unsub() runs can still fire — without this guard, that stale
    // callback could briefly apply Room A's data after the user has
    // already switched to Room B. Compares against the live ref (not a
    // value captured in this same closure) since this effect's own
    // local `activeRoomId` can never differ from itself.
    const subscribedRoomId = activeRoomId;
    const unsub = subscribeRoom(activeRoomId, (room: Room | null) => {
      if (subscribedRoomId !== activeRoomIdRef.current) return;
      if (room) {
        hasLoadedRoomDataRef.current = true;
      } else if (hasLoadedRoomDataRef.current) {
        // The room previously had real data and just delivered null —
        // it was deleted (e.g. the last other player left, or the host
        // removed it), not "still loading." Surface this clearly instead
        // of leaving the user on "Loading room..." forever.
        setError("Room no longer exists.");
        setActiveRoomId("");
        setRoomData(null);
        return;
      }
      setRoomData(room);
    });
    const unsubMessages = subscribeMessages(activeRoomId, setMessages);

    return () => {
      if (typeof unsub === "function") unsub();
      if (typeof unsubMessages === "function") unsubMessages();
      if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
      // BUG FIX: same leak as the dedicated unmount effect above — this
      // cleanup runs on every activeRoomId change (room switch) as well
      // as full unmount, and previously left rollFallbackTimeoutRef
      // untouched in both cases.
      if (rollFallbackTimeoutRef.current) clearTimeout(rollFallbackTimeoutRef.current);
    };
  }, [activeRoomId]);

  useEffect(() => {
    if (!roomData) return;
    const prev = prevRoomRef.current;

    if (!prev) {
      prevRoomRef.current = roomData;
      const moveKey = String(roomData.moveCount ?? 0);
      lastProcessedMoveRef.current = moveKey;

      if (roomData.positions) {
        setDisplayPositions(roomData.positions);
        pendingPositionsRef.current = roomData.positions;
      }
      return;
    }

    // BUG FIX: a restart ("Play Again") transitions status into
    // "countdown" — the one unambiguous signal that a new game is
    // starting. If a dice roll was still in flight when the restart
    // happened (e.g. Dice.tsx's onRollComplete fires in the brief window
    // before Board/DiceRow unmount for the countdown screen), these refs
    // could otherwise carry stale data from the PREVIOUS game into the
    // new one once that late completion callback runs.
    if (prev.status !== "countdown" && roomData.status === "countdown") {
      pendingJumpMessageRef.current = "";
      pendingPositionsRef.current = {};
      diceFinishedRef.current = true;
    }

    let isNewRoll = false;

    if (
      roomData.lastDice != null &&
      roomData.lastRolledBy &&
      roomData.positions &&
      prev.positions
    ) {
      const moveKey = String(roomData.moveCount ?? 0);

      if (lastProcessedMoveRef.current !== moveKey) {
        if (!diceFinishedRef.current) {
          if (Object.keys(pendingPositionsRef.current).length > 0) {
            setDisplayPositions(pendingPositionsRef.current);
          }
        }

        isNewRoll = true;
        diceFinishedRef.current = false;
        setDiceComplete(false);
        setJumpMessage("");

        if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);
        // See DICE_FALLBACK_TIMEOUT_MS comment above: this is a safety net
        // only, and must stay comfortably ahead of Dice.tsx's real
        // completion time (ROLL_MS + its own settle buffer) so it never
        // races the real onRollComplete signal under normal conditions.
        observerTimeoutRef.current = setTimeout(() => {
          observerTimeoutRef.current = null;
          if (!diceFinishedRef.current) {
            diceFinishedRef.current = true;
            // BUG FIX: this recovery path didn't clear
            // rollFallbackTimeoutRef, so if onRollComplete was genuinely
            // lost and THIS fallback recovered state, the separate 8s
            // roll-fallback timer from onRollDice was still live and
            // would fire setLoading(false) again ~2s later. Idempotent
            // (no visible bug), but a stray timer that — combined with
            // the unmount-cleanup gap fixed above — could outlive the
            // component.
            if (rollFallbackTimeoutRef.current) clearTimeout(rollFallbackTimeoutRef.current);
            setDiceComplete(true);
            setLoading(false);
            setJumpMessage(pendingJumpMessageRef.current);
            if (Object.keys(pendingPositionsRef.current).length > 0) {
              setDisplayPositions(pendingPositionsRef.current);
            }
          }
        }, DICE_FALLBACK_TIMEOUT_MS);

        const pid = roomData.lastRolledBy;
        const from = roomData.lastFrom;
        const to = roomData.positions?.[pid] ?? from;

        // BUG FIX: validate lastDice/lastFrom before using them to infer
        // a snake/ladder message. This is distinct from DiceRow's
        // lastDice validation (display-only, doesn't protect this
        // computation). Without it, a corrupted write (e.g. lastDice
        // outside 1-6, lastFrom outside 1-100, or either being NaN) could
        // produce a nonsensical "Snake!"/"Ladder!" message — it can't
        // crash anything here since it's pure number math, but the
        // inferred message would be meaningless.
        const diceValid =
          Number.isFinite(roomData.lastDice) &&
          (roomData.lastDice as number) >= 1 &&
          (roomData.lastDice as number) <= 6;
        const fromValid = from != null && Number.isFinite(from) && from >= 1 && from <= 100;

        if (diceValid && fromValid) {
          const movedTo = Math.min(100, (from as number) + (roomData.lastDice as number));
          if (to > movedTo) {
            pendingJumpMessageRef.current = `🪜 Ladder! ${movedTo} → ${to}`;
          } else if (to < movedTo) {
            pendingJumpMessageRef.current = `🐍 Snake! ${movedTo} → ${to}`;
          } else {
            pendingJumpMessageRef.current = "";
          }
        } else {
          pendingJumpMessageRef.current = "";
        }

        lastProcessedMoveRef.current = moveKey;
      }
    }

    if (roomData.positions) {
      if (isNewRoll || !diceFinishedRef.current) {
        pendingPositionsRef.current = roomData.positions;
      } else {
        setDisplayPositions(roomData.positions);
        pendingPositionsRef.current = roomData.positions;
      }
    }

    prevRoomRef.current = roomData;
  }, [roomData]);

  const isPlayingOrFinished =
    roomData?.status === "playing" || roomData?.status === "finished";

  const closeChatDrawer = useCallback(() => {
    setChatOpen(false);
    const drawer = drawerRef.current;
    if (drawer) {
      drawer.style.bottom = '';
      drawer.style.height = '';
      drawer.classList.remove('keyboard-active');
    }
  }, []);

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        minHeight: "100dvh",
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        color: "var(--text-primary)",
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      <div
        style={{
          maxWidth: isTablet ? "1400px" : "100%",
          width: "100%",
          margin: "0 auto",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          paddingTop: "max(0px, env(safe-area-inset-top))",
          paddingLeft: "max(12px, env(safe-area-inset-left))",
          paddingRight: "max(12px, env(safe-area-inset-right))",
        }}
      >
        {/* ── LOGIN SCREEN ── */}
        {!activeRoomId && (
          <LoginScreen
            playerId={playerId}
            playerName={playerName}
            setPlayerName={setPlayerName}
            joinId={joinId}
            setJoinId={setJoinId}
            error={error}
            loading={loading}
            onCreateRoom={onCreateRoom}
            onJoinRoom={onJoinRoom}
          />
        )}

        {/* ── LOADING ROOM ── */}
        {activeRoomId && !roomData && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 15,
            }}
          >
            Loading room...
          </div>
        )}

        {/* ── MAIN GAME VIEW ── */}
        {roomData && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {error && (
              <div
                style={{
                  position: "fixed",
                  top: 16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--danger)",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 6,
                  zIndex: "var(--z-modal)", // ★ DESIGN TOKEN
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <span>{error}</span>
                <button
                  onClick={() => setError("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {!isCompact && (
              <GameHeader
                roomId={roomData.id!}
                players={roomData.players ?? EMPTY_PLAYERS_LIST}
                playerColors={roomData.playerColors || EMPTY_PLAYER_MAP}
                playerNames={roomData.playerNames || EMPTY_PLAYER_MAP}
                isTablet={isTablet}
              />
            )}

            <div
              style={{
                display: "flex",
                flexDirection: isTablet ? "row" : "column",
                flex: 1,
                minHeight: 0,
                gap: isTablet ? 16 : 0,
                alignItems: "stretch",
                overflow: "hidden",
              }}
            >
              {/* LEFT COLUMN */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  overflow: isPlayingOrFinished ? "hidden" : "auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 8,
                  position: "relative",
                }}
              >
                {roomData.status === "waiting" && (
                  <Lobby
                    roomData={roomData}
                    playerId={playerId}
                    activeRoomId={activeRoomId}
                    playerColor={playerColor}
                    loading={loading}
                    copied={copied}
                    setCopied={setCopied}
                    onPickColor={onPickColor}
                    onStartGame={onStartGame}
                    isCompact={isCompact}
                  />
                )}

                {roomData.status === "countdown" && (
                  <CountdownCard
                    countdown={countdown}
                    hostName={getName(roomData.hostId)}
                  />
                )}

                {(roomData.status === "playing" ||
                  roomData.status === "finished") && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: "100%",
                      flex: 1,
                      minHeight: 0,
                      overflow: "hidden",
                    }}
                  >
                    {/* TOP BAR */}
                    <div style={{ flexShrink: 0, padding: "2px 8px 4px" }}>
                      {roomData.status === "playing" ? (
                        <div
                          className="turn-indicator"
                          style={{
                            fontSize: 13,
                            padding: "1px 0",
                            marginBottom: 4,
                          }}
                        >
                          {currentTurnName}'s turn
                          {roomData.currentTurn === playerId ? " (You)" : ""}
                        </div>
                      ) : (
                        <div
                          style={{
                            background: "var(--bg-tertiary)",
                            borderRadius: 8,
                            padding: "4px 10px",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            display: "flex",
                            gap: 12,
                            border: "1px solid var(--border)",
                            marginBottom: 4,
                          }}
                        >
                          <span>
                            <b style={{ color: "var(--text-primary)" }}>
                              Status:
                            </b>{" "}
                            {roomData.status}
                          </span>
                          <span>
                            <b style={{ color: "var(--text-primary)" }}>
                              Host:
                            </b>{" "}
                            {getName(roomData.hostId)}
                          </span>
                        </div>
                      )}

                      {roomData.positions && (
                        <Scoreboard
                          players={roomData.players ?? EMPTY_PLAYERS_LIST}
                          /*
                            BUG FIX: this previously read roomData.positions
                            directly — the raw, immediate Firestore value —
                            while Board reads displayPositions (buffered,
                            only updates once the dice animation actually
                            finishes). That mismatch meant the scoreboard's
                            "Sq. N" number and "rolling..." label could
                            visually update to the FINAL position the
                            instant Firestore pushed the roll, while the
                            token on the board was still mid-walk toward
                            that square — making it look like "the piece
                            already moved" even though the board itself was
                            animating correctly. Using the same
                            displayPositions the board uses keeps both
                            views in lockstep.
                          */
                          positions={displayPositions}
                          playerColors={roomData.playerColors || EMPTY_PLAYER_MAP}
                          playerNames={roomData.playerNames || EMPTY_PLAYER_MAP}
                          currentTurn={roomData.currentTurn}
                          status={roomData.status}
                          winnerId={roomData.winnerId ?? null}
                          playerId={playerId}
                          lastDice={roomData.lastDice ?? null}
                          lastRolledBy={roomData.lastRolledBy ?? null}
                          // The "rolling..." label should track the same
                          // diceComplete gate the board uses, not just
                          // currentTurn/status, so the label can't say
                          // "rolling..." after the token has actually
                          // finished walking, or stop saying it before the
                          // token has finished.
                          diceComplete={diceComplete}
                        />
                      )}
                    </div>

                    {/* BOARD AREA */}
                    <div
                      ref={boardContainerRef}
                      style={{
                        flex: 1,
                        minHeight: 0,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        overflow: "hidden",
                      }}
                    >
                      <Board
                        key={activeRoomId}
                        positions={displayPositions}
                        playerNames={roomData?.playerNames || EMPTY_PLAYER_MAP}
                        roomData={roomData}
                        hideLegend={true}
                        diceComplete={diceComplete}
                        dimensions={
                          boardDims.width > 0 ? boardDims : undefined
                        }
                      />
                    </div>

                    {/* BOTTOM BAR */}
                    <div style={{ flexShrink: 0, padding: "0 8px" }}>
                      {roomData.status === "finished" &&
                        roomData.winnerId &&
                        diceComplete && (
                          <WinnerOverlay
                            winnerName={getName(roomData.winnerId)}
                            isHost={roomData.hostId === playerId}
                            onPlayAgain={async () => {
                              setError("");
                              try {
                                await startGame(activeRoomId, playerId);
                              } catch (e: unknown) {
                                setError(
                                  e instanceof Error ? e.message : "Failed to restart game"
                                );
                              }
                            }}
                            onLeave={onLeaveRoom}
                          />
                        )}

                      {roomData.status === "playing" && (
                        <DiceRow
                          onRoll={onRollDice}
                          disabled={!isMyTurn || loading}
                          lastDice={
                            roomData.lastDice != null &&
                            roomData.lastDice >= 1 &&
                            roomData.lastDice <= 6
                              ? (roomData.lastDice as Face)
                              : null
                          }
                          rollKey={String(roomData.moveCount ?? 0)}
                          jumpMessage={jumpMessage}
                          onRollComplete={handleRollComplete}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: TABLET CHAT */}
              {isTablet && (
                <div
                  style={{
                    width: 320,
                    flexShrink: 0,
                    backgroundColor: "var(--bg-primary)",
                    borderRadius: 8,
                    padding: "16px 8px 8px 8px",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    maxHeight: "100%",
                    overflow: "hidden",
                    boxShadow: "var(--shadow-md)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 12,
                      paddingLeft: 8,
                    }}
                  >
                    <span
                      style={{ color: "var(--text-muted)", fontSize: 20 }}
                    >
                      #
                    </span>
                    <h3
                      style={{
                        margin: 0,
                        color: "var(--text-primary)",
                        fontSize: 16,
                      }}
                    >
                      chat
                    </h3>
                  </div>
                  <Chat
                    messages={messages}
                    playerId={playerId}
                    playerName={playerName}
                    activeRoomId={activeRoomId}
                    roomData={roomData}
                    inDrawer={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* MOBILE CHAT: FLOATING ACTION BUTTON */}
        {!isTablet && activeRoomId && !chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            style={{
              position: "fixed",
              // BUG FIX (chat button hidden behind / hiding the snake-
              // ladder jump-message pill): the FAB and DiceRow's jump
              // message pill both occupy the bottom-right corner of the
              // screen on mobile, and neither knew about the other —
              // raising one's z-index just made it cover the other
              // instead of the reverse. Real fix: when a jump message is
              // showing, shrink the FAB and slide it up-and-right into a
              // small icon that tucks above the pill, instead of the two
              // competing for the exact same spot. They now coexist
              // instead of stacking.
              // Requested: shift the FAB up a bit from the bottom edge on
              // mobile so it doesn't sit flush at the same baseline as
              // the dice card below it. This only adjusts the FAB's own
              // resting position — the board, the dice row, and desktop/
              // tablet layout (this whole block only renders when
              // !isTablet) are untouched.
              bottom: jumpMessage
                ? "calc(max(24px, env(safe-area-inset-bottom)) + 64px)"
                : "calc(max(24px, env(safe-area-inset-bottom)) + 16px)",
              right: jumpMessage ? 16 : 24,
              minHeight: jumpMessage ? 40 : 56,
              minWidth: jumpMessage ? 40 : 56,
              borderRadius: "50%",
              backgroundColor: "var(--accent)",
              color: "white",
              fontSize: jumpMessage ? 18 : 24,
              zIndex: "var(--z-drawer)", // ★ DESIGN TOKEN
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "1px solid rgba(255,255,255,0.2)",
              transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), bottom 0.25s ease, right 0.25s ease, min-height 0.25s ease, min-width 0.25s ease, font-size 0.25s ease",
            }}
          >
            <svg
              width={jumpMessage ? 18 : 24}
              height={jumpMessage ? 18 : 24}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" />
            </svg>
            {unreadCount > 0 && (
              <div
                className="unread-badge"
                style={{ border: "3px solid var(--bg-secondary)" }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            )}
          </button>
        )}

        {/* MOBILE CHAT: SLIDE-UP DRAWER — Keyboard-aware */}
        {!isTablet && activeRoomId && (
          <>
            <div
              className={`drawer-backdrop ${chatOpen ? "open" : ""}`}
              onClick={closeChatDrawer}
            />
            <div
              ref={drawerRef}
              className={`chat-drawer ${chatOpen ? "open" : ""}`}
              style={{
                padding: "12px 0",
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
              }}
            >
              <div className="drawer-handle" />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  padding: "0 12px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    style={{ color: "var(--text-muted)", fontSize: 20 }}
                  >
                    #
                  </span>
                  <h3
                    style={{
                      margin: 0,
                      color: "var(--text-primary)",
                      fontSize: 16,
                    }}
                  >
                    chat
                  </h3>
                </div>
                <button
                  onClick={closeChatDrawer}
                  style={{
                    minHeight: 32,
                    minWidth: 32,
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontSize: 24,
                    border: "none",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
              <Chat
                messages={messages}
                playerId={playerId}
                playerName={playerName}
                activeRoomId={activeRoomId}
                roomData={roomData}
                inDrawer={true}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}