import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dice from "../../../components/Dice";
import { useBoardStage } from "../../../hooks/useBoardStage";
import WinnerOverlay from "../../../components/WinnerOverlay";
import { describeProgress } from "../board";
import { playLudoSound } from "../sound";
import { COLOR_LABEL, deriveUiPhase, type UiPhase } from "../state";
import { PALETTE } from "../theme";
import type { LudoAction, LudoColor, LudoRoom } from "../types";
import { LUDO_ROLL_MS, usePresentation } from "../usePresentation";
import LudoBoard from "./LudoBoard";
import LudoPlayers from "./LudoPlayers";
import TurnTimer from "./TurnTimer";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

type Props = {
  room: LudoRoom;
  playerId: string;
  pending: LudoAction["type"] | null;
  act: (action: LudoAction, options?: { versioned?: boolean }) => Promise<boolean>;
  onLeave: () => void;
  serverNow: () => number;
  sound: boolean;
  onToggleSound: () => void;
  /** Phones: the room header's slot; the players are shown there. */
  headerSlot?: HTMLElement | null;
};

const WIDE_MIN_WIDTH = 760;
const PANEL_WIDTH = 280;

/** Whether the game area has room for the side panel. Re-renders only when
 *  that answer changes, and judges by the tallest height seen at this width,
 *  so the phone keyboard never switches layouts. */
function useWideLayout() {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen = { width: 0, height: 0 };
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      seen = width !== seen.width ? { width, height } : { width, height: Math.max(seen.height, height) };
      setWide(width >= WIDE_MIN_WIDTH && width - PANEL_WIDTH >= Math.min(seen.height, 520));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, wide };
}

function statusLine(ui: UiPhase, nameOf: (color: LudoColor | null) => string, dice: number | null): string {
  switch (ui.kind) {
    case "my-roll":
      return "Your turn — roll the dice";
    case "my-move":
      return `Move ${ui.dice} — pick:`;
    case "their-turn":
      return ui.phase === "roll" ? `${nameOf(ui.color)} is rolling…` : `${nameOf(ui.color)} rolled ${dice} — choosing…`;
    case "animating":
      return ui.color ? `${nameOf(ui.color)} is playing…` : "…";
    case "spectating":
      return "You're watching — you're no longer in this game.";
    case "finished":
      return "Game over";
    default:
      return "";
  }
}

export default function LudoGameView({ room, playerId, pending, act, onLeave, serverNow, sound, onToggleSound, headerSlot = null }: Props) {
  const game = room.ludo.game!;
  const { ref: layoutRef, wide } = useWideLayout();
  const stage = useBoardStage();
  const [focusToken, setFocusToken] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const nameById = useCallback((id: string | null | undefined) => (id && room.playerNames[id]) || "Player", [room.playerNames]);
  const colorOwner = useMemo(() => Object.fromEntries(game.players.map((p) => [p.color, p.id])), [game.players]);
  const nameOfColor = useCallback((color: LudoColor | null) => (color ? nameById(colorOwner[color]) : ""), [colorOwner, nameById]);

  const { view, notice, onDiceSettled } = usePresentation(game, { myId: playerId, nameOf: nameById, sound });
  const ui = deriveUiPhase(room, playerId, view.stage, view.actorColor);

  const me = game.players.find((p) => p.id === playerId);
  const myColor = me && me.status !== "left" ? me.color : null;
  const colorsInPlay = useMemo(() => game.players.map((p) => p.color), [game.players]);
  const names = useMemo(
    () => Object.fromEntries(game.players.map((p) => [p.color, `${nameById(p.id)}${p.id === playerId ? " (You)" : ""}`])),
    [game.players, nameById, playerId]
  );
  const turnColor = ui.kind === "animating" ? ui.color : game.status === "playing" ? game.turn.color : null;
  const selectable = ui.kind === "my-move" ? ui.legal : null;
  const moving = pending === "move";
  const myTurnNow = ui.kind === "my-roll" || ui.kind === "my-move";

  const pick = useCallback(
    (token: number) => {
      if (moving) return;
      setFocusToken(null);
      void act({ type: "move", token }, { versioned: true });
    },
    [act, moving]
  );
  const roll = useCallback(async () => {
    await act({ type: "roll" }, { versioned: true });
  }, [act]);
  const tick = useCallback(() => {
    if (sound && myTurnNow) playLudoSound("tick");
  }, [sound, myTurnNow]);

  useEffect(() => {
    if (!confirmLeave) return;
    const id = setTimeout(() => setConfirmLeave(false), 3000);
    return () => clearTimeout(id);
  }, [confirmLeave]);

  const winnerId = ui.kind === "finished" ? ui.winnerId : null;
  const winnerColor = winnerId ? game.players.find((p) => p.id === winnerId)?.color : null;
  const turnName = turnColor ? (colorOwner[turnColor] === playerId ? "Your" : `${nameOfColor(turnColor)}'s`) : "";

  const banner = (
    <div className="ludo-banner" style={{ ["--seat" as string]: turnColor ? PALETTE[turnColor].base : "var(--border-strong)" }}>
      <span className="ludo-banner__dot" aria-hidden="true" />
      <span className="ludo-banner__text" aria-live="polite">
        {ui.kind === "finished" ? (
          winnerId ? (
            <>
              <b>{winnerColor ? COLOR_LABEL[winnerColor] : ""}</b> — {nameById(winnerId)} wins!
            </>
          ) : (
            "Game over"
          )
        ) : turnColor ? (
          <>
            <b>{COLOR_LABEL[turnColor]}</b> — {turnName} turn
          </>
        ) : null}
      </span>
      {game.status === "playing" && (
        <TurnTimer
          deadline={game.turn.deadline}
          turnSeconds={game.settings.turnSeconds}
          serverNow={serverNow}
          onTick={tick}
        />
      )}
      <button
        type="button"
        className="ludo-icon-btn"
        aria-pressed={sound}
        aria-label={sound ? "Sound on" : "Sound off"}
        title={sound ? "Sound on" : "Sound off"}
        onClick={onToggleSound}
      >
        {sound ? "🔊" : "🔇"}
      </button>
      <button
        type="button"
        className={`ludo-icon-btn ludo-leave${confirmLeave ? " is-confirm" : ""}`}
        onClick={() => (confirmLeave || !myColor || game.status !== "playing" ? onLeave() : setConfirmLeave(true))}
      >
        {confirmLeave ? "Forfeit?" : "Leave"}
      </button>
    </div>
  );

  // Phones/tablets: the die floats in the middle of the board (tap it to roll);
  // the wide layout keeps it in a card in the side panel.
  const dice = (
    <Dice
      onRoll={roll}
      disabled={ui.kind !== "my-roll" || pending !== null}
      lastDice={view.dice ? (view.dice.value as Face) : null}
      rollKey={view.dice?.key ?? ""}
      onRollComplete={onDiceSettled}
      feedback={sound}
      rollMs={LUDO_ROLL_MS}
      floating={!wide}
    />
  );

  const status = statusLine(ui, nameOfColor, game.turn.dice);
  const picks = ui.kind === "my-move" && (
    <span className="ludo-picks">
      {ui.legal.map((token) => (
        <button
          key={token}
          type="button"
          className="ludo-pick"
          style={{ ["--token" as string]: PALETTE[myColor ?? "red"].base }}
          disabled={moving}
          aria-label={`Move token ${token + 1}, ${describeProgress(game.tokens[myColor!]?.[token] ?? -1)}`}
          onMouseEnter={() => setFocusToken(token)}
          onMouseLeave={() => setFocusToken(null)}
          onFocus={() => setFocusToken(token)}
          onBlur={() => setFocusToken(null)}
          onClick={() => pick(token)}
        >
          {token + 1}
        </button>
      ))}
    </span>
  );

  // Phones/tablets: the banner says whose turn it is and the die and the
  // token picks float on the board, so the status line only stays for a
  // spectator (the text is still read out either way).
  const actions = (
    <div className="ludo-actions">
      <div className="ludo-actions__status">
        <span className="ludo-actions__text">{status}</span>
        {picks}
      </div>
      {wide && (
        <div className="ludo-dice" style={{ ["--seat" as string]: turnColor ? PALETTE[turnColor].base : "var(--border)" }}>
          {dice}
        </div>
      )}
    </div>
  );

  const players = (
    <LudoPlayers
      players={game.players}
      names={room.playerNames}
      tokens={view.tokens}
      turnColor={turnColor}
      myId={playerId}
      finished={ui.kind === "finished"}
      vertical={wide}
    />
  );

  return (
    <div ref={layoutRef} className={`ludo-game${wide ? " is-wide" : ""}${ui.kind === "my-roll" ? " is-my-roll" : ""}`}>
      {!wide && (headerSlot ? createPortal(<div className="ludo-header-players">{players}</div>, headerSlot) : players)}
      {!wide && banner}

      {/* Never taller than wide, so the board and the dice stay together */}
      <div className="ludo-stage-area" ref={stage.ref} data-content-end style={wide || !stage.width ? undefined : { maxHeight: stage.width }}>
        <div className="ludo-notice-slot" role="status" aria-live="polite">
          {notice && (
            <div key={notice.id} className={`ludo-notice ludo-notice--${notice.tone}`}>
              {notice.text}
            </div>
          )}
        </div>
        {stage.side > 0 && (
          <div
            ref={stage.stageRef}
            className="board-stage"
            style={{ width: stage.side, height: stage.side, flexShrink: 0 }}
          >
            <LudoBoard
              size={stage.side}
              colorsInPlay={colorsInPlay}
              tokens={view.tokens}
              turnColor={turnColor}
              myColor={myColor}
              selectable={selectable}
              focusToken={focusToken}
              movingToken={view.movingToken}
              capturedTokens={view.capturedTokens}
              homeToken={view.homeToken}
              names={names}
              safeSquares={game.settings.safeSquares}
              onPick={pick}
            />
          </div>
        )}
        {!wide && stage.side > 0 && (
          <div ref={stage.overlayRef} className="board-overlay">
            <span className="sr-only" aria-live="polite">{status}</span>
            <div className="board-dice board-dice--center">{dice}</div>
            {picks && <div className="board-picks">{picks}</div>}
          </div>
        )}
      </div>

      {wide ? (
        <aside className="ludo-panel">
          <section>
            <p className="panel-label">Turn</p>
            {banner}
          </section>
          <section>
            <p className="panel-label">Players</p>
            {players}
          </section>
          <section>
            <p className="panel-label">Dice</p>
            {actions}
          </section>
        </aside>
      ) : (
        ui.kind === "spectating" && actions
      )}

      {ui.kind === "finished" && (
        <WinnerOverlay
          winnerName={winnerId ? `${nameById(winnerId)}${winnerColor ? ` (${COLOR_LABEL[winnerColor]})` : ""}` : "Nobody"}
          isHost={room.hostId === playerId}
          onPlayAgain={() => act({ type: "restart" })}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}

