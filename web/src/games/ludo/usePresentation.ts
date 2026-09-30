// Animation controller: authoritative game state -> what is on screen.
//
// The server appends numbered events (roll, move, capture…) to the game. We
// replay new events one at a time — dice roll, then the token hopping square
// by square, then captures — and when the queue is empty the display snaps
// to the authoritative token positions. Animations never change game state;
// if we fall behind (hidden tab, reconnect, missed events) we skip straight
// to the current state instead of replaying history.
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE, HOME_PROGRESS, stepPath } from "./board";
import { playLudoSound, type LudoSound } from "./sound";
import { COLOR_LABEL, currentPlayerId, type PresentationStage } from "./state";
import type { LudoColor, LudoEvent, LudoGame, LudoTokens } from "./types";

export const LUDO_ROLL_MS = 1100;
const STEP_MS = 190;
const EXIT_MS = 330;
const DICE_FALLBACK_MS = LUDO_ROLL_MS + 1800;
const MAX_BACKLOG = 8;
const NOTICE_MS = 2000;

export type NoticeTone = "info" | "good" | "bad" | "mine";
export type Notice = { id: number; text: string; tone: NoticeTone };

export type Presentation = {
  stage: PresentationStage;
  tokens: LudoTokens;
  dice: { value: number; key: string } | null;
  actorColor: LudoColor | null;
  movingToken: string | null;
  capturedTokens: string[];
  homeToken: string | null;
};

const EMPTY: Presentation = {
  stage: "idle",
  tokens: {},
  dice: null,
  actorColor: null,
  movingToken: null,
  capturedTokens: [],
  homeToken: null,
};

const tokenId = (color: LudoColor, token: number) => `${color}-${token}`;

function withToken(tokens: LudoTokens, color: LudoColor, token: number, progress: number): LudoTokens {
  const list = [...(tokens[color] ?? [])];
  list[token] = progress;
  return { ...tokens, [color]: list };
}

function lastRoll(game: LudoGame): Presentation["dice"] {
  for (let i = game.events.length - 1; i >= 0; i--) {
    const e = game.events[i];
    if (e.type === "roll") return { value: e.dice, key: String(e.seq) };
  }
  return null;
}

function snapshot(game: LudoGame | null): Presentation {
  return game ? { ...EMPTY, tokens: game.tokens, dice: lastRoll(game) } : EMPTY;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Options = {
  myId: string;
  nameOf: (playerId: string | null | undefined) => string;
  sound: boolean;
};

export function usePresentation(game: LudoGame | null, options: Options) {
  const [view, setView] = useState<Presentation>(() => snapshot(game));
  const [notice, setNotice] = useState<Notice | null>(null);

  const gameRef = useRef(game);
  const optionsRef = useRef(options);
  const shownSeqRef = useRef(game ? game.eventSeq : -1); // last event fully presented
  const queuedSeqRef = useRef(shownSeqRef.current); // last event queued
  const queueRef = useRef<LudoEvent[]>([]);
  const runningRef = useRef(false);
  const genRef = useRef(0); // bumped to cancel an in-flight run
  const diceDoneRef = useRef<(() => void) | null>(null);
  const noticeIdRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcedTurnRef = useRef("");

  useEffect(() => {
    optionsRef.current = options;
  });

  const play = useCallback((sound: LudoSound) => {
    if (optionsRef.current.sound) playLudoSound(sound);
  }, []);

  const say = useCallback((text: string, tone: NoticeTone = "info") => {
    const id = ++noticeIdRef.current;
    setNotice({ id, text, tone });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), NOTICE_MS);
  }, []);

  /** Announces the start of the local player's turn once. */
  const announceTurn = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.status !== "playing" || g.turn.phase !== "roll") return;
    if (currentPlayerId(g) !== optionsRef.current.myId) return;
    const key = String(g.turnNumber);
    if (announcedTurnRef.current === key) return;
    announcedTurnRef.current = key;
    play("turn");
    say("Your turn — roll the dice!", "mine");
  }, [play, say]);

  const settle = useCallback(() => {
    const g = gameRef.current;
    setView((v) => (g ? { ...v, ...EMPTY, dice: v.dice, tokens: g.tokens } : EMPTY));
    announceTurn();
  }, [announceTurn]);

  const snapTo = useCallback(
    (g: LudoGame | null) => {
      genRef.current += 1;
      runningRef.current = false;
      queueRef.current = [];
      diceDoneRef.current?.();
      diceDoneRef.current = null;
      shownSeqRef.current = g ? g.eventSeq : -1;
      queuedSeqRef.current = shownSeqRef.current;
      setView(snapshot(g));
      announceTurn();
    },
    [announceTurn]
  );

  const present = useCallback(
    async (event: LudoEvent, alive: () => boolean) => {
      const { myId, nameOf } = optionsRef.current;
      const actor = "player" in event ? event.player : null;
      const isMe = actor === myId;
      const who = isMe ? "You" : nameOf(actor);

      switch (event.type) {
        case "start": {
          const first = gameRef.current?.players.find((p) => p.color === event.color)?.id;
          say(first === myId ? "You go first!" : `${nameOf(first)} goes first`);
          await sleep(400);
          return;
        }
        case "roll": {
          setView((v) => ({
            ...v,
            stage: "rolling",
            actorColor: event.color,
            movingToken: null,
            capturedTokens: [],
            homeToken: null,
            dice: { value: event.dice, key: String(event.seq) },
          }));
          await new Promise<void>((resolve) => {
            diceDoneRef.current = resolve;
            setTimeout(resolve, DICE_FALLBACK_MS);
          });
          diceDoneRef.current = null;
          if (!alive()) return;
          if (event.outcome === "no-moves") {
            say(event.extraTurn ? `No move for ${isMe ? "you" : who} — a 6, so roll again` : `No move for ${isMe ? "you" : who}`);
            await sleep(900);
          } else if (event.outcome === "too-many-sixes") {
            play("bad");
            say(`Three 6s in a row — ${isMe ? "your" : `${who}'s`} turn is lost`, "bad");
            await sleep(1200);
          }
          return;
        }
        case "move": {
          const id = tokenId(event.color, event.token);
          setView((v) => ({ ...v, stage: "moving", actorColor: event.color, movingToken: id, capturedTokens: [], homeToken: null }));
          for (const progress of stepPath(event.from, event.to)) {
            setView((v) => ({ ...v, tokens: withToken(v.tokens, event.color, event.token, progress) }));
            play(event.from === BASE ? "exit" : "step");
            await sleep(event.from === BASE ? EXIT_MS : STEP_MS);
            if (!alive()) return;
          }
          if (event.captures.length > 0) {
            setView((v) => {
              let tokens = v.tokens;
              for (const c of event.captures) tokens = withToken(tokens, c.color, c.token, BASE);
              return { ...v, tokens, movingToken: null, capturedTokens: event.captures.map((c) => tokenId(c.color, c.token)) };
            });
            play("capture");
            const victims = [...new Set(event.captures.map((c) => COLOR_LABEL[c.color]))].join(" & ");
            const victimIsMe = event.captures.some(
              (c) => gameRef.current?.players.find((p) => p.color === c.color)?.id === myId
            );
            say(`${who} captured ${victimIsMe ? "your token" : victims}!`, isMe ? "good" : victimIsMe ? "bad" : "info");
            await sleep(700);
            if (!alive()) return;
          }
          if (event.home) {
            setView((v) => ({ ...v, movingToken: null, homeToken: id }));
            play("home");
            say(event.finishedPlayer ? `${who} got every token home!` : `${isMe ? "Your" : `${who}'s`} token reached home!`, "good");
            await sleep(650);
            if (!alive()) return;
          }
          if (event.extraTurn) {
            const reason = { six: "Rolled a 6", capture: "Capture bonus", home: "Home bonus" }[event.extraTurn];
            play("extra");
            say(`${reason} — ${isMe ? "roll again!" : `${who} rolls again`}`, isMe ? "mine" : "info");
            await sleep(450);
          } else {
            await sleep(150);
          }
          return;
        }
        case "skip":
          say(`${who} ran out of time`);
          await sleep(700);
          return;
        case "leave":
          setView((v) => ({
            ...v,
            tokens: { ...v.tokens, [event.color]: (v.tokens[event.color] ?? []).map((p) => (p === HOME_PROGRESS ? p : BASE)) },
          }));
          say(event.reason === "inactive" ? `${who} ${isMe ? "were" : "was"} removed for inactivity` : `${who} left the game`);
          await sleep(700);
          return;
        case "end":
          play("victory");
          return;
      }
    },
    [play, say]
  );

  const run = useCallback(async () => {
    runningRef.current = true;
    const gen = genRef.current;
    const alive = () => gen === genRef.current;
    while (queueRef.current.length > 0) {
      const event = queueRef.current.shift()!;
      await present(event, alive);
      if (!alive()) return;
      shownSeqRef.current = event.seq;
    }
    runningRef.current = false;
    settle();
  }, [present, settle]);

  useEffect(() => {
    gameRef.current = game;
    if (!game) {
      if (shownSeqRef.current !== -1) snapTo(null);
      return;
    }
    const queued = queuedSeqRef.current;
    // First sight, a new game, or a hidden tab: show the current state as is.
    if (queued < 0 || game.eventSeq < queued || document.hidden) {
      if (game.eventSeq !== shownSeqRef.current || queued < 0) snapTo(game);
      else if (!runningRef.current) settle();
      return;
    }
    const fresh = game.events.filter((e) => e.seq > queued);
    if (fresh.length === 0) {
      if (!runningRef.current) settle();
      return;
    }
    // Missed events (fell out of the log) or too far behind: skip ahead.
    if (fresh[0].seq !== queued + 1 || queueRef.current.length + fresh.length > MAX_BACKLOG) {
      snapTo(game);
      return;
    }
    queueRef.current.push(...fresh);
    queuedSeqRef.current = fresh[fresh.length - 1].seq;
    if (!runningRef.current) void run();
  }, [game, run, settle, snapTo]);

  // Coming back to a hidden tab: jump to the present.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && gameRef.current && (runningRef.current || queueRef.current.length)) snapTo(gameRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [snapTo]);

  useEffect(
    () => () => {
      genRef.current += 1;
      diceDoneRef.current?.();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  /** Called by the dice when its roll animation has settled. */
  const onDiceSettled = useCallback(() => diceDoneRef.current?.(), []);

  return { view, notice, onDiceSettled };
}
