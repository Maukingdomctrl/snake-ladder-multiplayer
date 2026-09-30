import { useState } from "react";
import { COLORS } from "../board";
import { COLOR_LABEL, lobbyPhase, seatLabel } from "../state";
import { PALETTE } from "../theme";
import type { LudoAction, LudoColor, LudoRoom } from "../types";

type Props = {
  room: LudoRoom;
  playerId: string;
  pending: LudoAction["type"] | null;
  act: (action: LudoAction) => Promise<boolean>;
  onLeave: () => void;
};

const PHASE_TEXT = {
  "waiting-for-players": "Waiting for players",
  "waiting-for-ready": "Waiting for ready",
  ready: "Ready to start",
};

export default function LudoLobby({ room, playerId, pending, act, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const { seats, settings } = room.ludo;
  const phase = lobbyPhase(room);
  const isHost = room.hostId === playerId;
  const me = seats.find((s) => s.id === playerId);
  const nameOf = (id: string) => room.playerNames[id] || "Player";
  const busy = pending !== null;
  const missing = settings.maxPlayers - seats.length;
  // Numbered clockwise by colour, the same as during the game.
  const seatNumber = (color: LudoColor) => COLORS.filter((c) => seats.some((s) => s.color === c)).indexOf(color) + 1;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is on screen anyway
    }
  };

  const startHint =
    phase === "waiting-for-players"
      ? `Waiting for ${missing} more player${missing === 1 ? "" : "s"} to join`
      : phase === "waiting-for-ready"
        ? "Waiting for everyone to be ready"
        : "Everyone is ready!";

  return (
    <div className="ludo-lobby">
      <div className="ludo-card">
        <h2 className="ludo-lobby__title">Ludo</h2>
        <div className="ludo-chips">
          <span className="ludo-chip">
            <b>Status:</b> {PHASE_TEXT[phase]}
          </span>
          <span className="ludo-chip">
            <b>Host:</b> {nameOf(room.hostId)}
          </span>
        </div>

        <div className="ludo-code">
          <div>
            <p className="ludo-label">Room code</p>
            <p className="ludo-code__value">{room.id}</p>
          </div>
          <button type="button" className="ludo-small-btn" onClick={copyCode}>
            {copied ? "✓ Copied!" : "Copy"}
          </button>
        </div>

        <div className="ludo-section">
          <p className="ludo-label" id="ludo-count-label">
            Players
          </p>
          {isHost ? (
            <div className="ludo-segmented" role="radiogroup" aria-labelledby="ludo-count-label">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={settings.maxPlayers === n}
                  className={settings.maxPlayers === n ? "is-active" : ""}
                  disabled={busy || n < seats.length}
                  title={n < seats.length ? `${seats.length} players are already here` : undefined}
                  onClick={() => settings.maxPlayers !== n && act({ type: "settings", maxPlayers: n })}
                >
                  {n} players
                </button>
              ))}
            </div>
          ) : (
            <p className="ludo-muted">{settings.maxPlayers} players</p>
          )}
        </div>

        <ul className="ludo-seats" aria-label="Seats">
          {seats.map((seat) => (
            <li key={seat.id} className="ludo-seat">
              <span className="ludo-seat__token" style={{ background: PALETTE[seat.color].base }} aria-hidden="true">
                {nameOf(seat.id).charAt(0).toUpperCase()}
              </span>
              <span className="ludo-seat__text">
                <span className="ludo-seat__name">
                  {nameOf(seat.id)}
                  {seat.id === playerId ? " (You)" : ""}
                </span>
                <span className="ludo-seat__color" style={{ color: PALETTE[seat.color].text }}>
                  {seatLabel(seat.color, seatNumber(seat.color))}
                </span>
              </span>
              {seat.id === room.hostId && <span className="ludo-badge ludo-badge--host">HOST</span>}
              <span className={`ludo-badge ${seat.ready ? "ludo-badge--ready" : "ludo-badge--wait"}`}>
                {seat.ready ? "Ready" : "Not ready"}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, missing) }, (_, i) => (
            <li key={`empty-${i}`} className="ludo-seat ludo-seat--empty">
              <span className="ludo-seat__token ludo-seat__token--empty" aria-hidden="true" />
              <span className="ludo-muted">Waiting for a player…</span>
            </li>
          ))}
        </ul>

        {me && (
          <div className="ludo-section">
            <p className="ludo-label" id="ludo-color-label">
              Your colour
            </p>
            <div className="ludo-swatches" role="radiogroup" aria-labelledby="ludo-color-label">
              {COLORS.map((color) => {
                const takenBy = seats.find((s) => s.color === color && s.id !== playerId);
                const selected = me.color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={takenBy ? `${COLOR_LABEL[color]}, taken by ${nameOf(takenBy.id)}` : COLOR_LABEL[color]}
                    className={`ludo-swatch${selected ? " is-selected" : ""}`}
                    style={{ background: PALETTE[color].base }}
                    disabled={busy || Boolean(takenBy)}
                    onClick={() => !selected && act({ type: "color", color })}
                  >
                    {selected ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isHost ? (
          <>
            <button
              type="button"
              className="btn-primary ludo-wide-btn"
              disabled={busy || phase !== "ready"}
              onClick={() => act({ type: "start" })}
            >
              {pending === "start" ? "Starting…" : "Start game"}
            </button>
            <p className="ludo-hint" aria-live="polite">
              {startHint}
            </p>
          </>
        ) : me ? (
          <>
            <button
              type="button"
              className={me.ready ? "btn-secondary ludo-wide-btn" : "btn-primary ludo-wide-btn"}
              disabled={busy}
              aria-pressed={me.ready}
              onClick={() => act({ type: "ready", ready: !me.ready })}
            >
              {me.ready ? "Not ready yet" : "I'm ready"}
            </button>
            <p className="ludo-hint" aria-live="polite">
              {me.ready ? "Waiting for the host to start…" : "Tap “I'm ready” when you are set."}
            </p>
          </>
        ) : null}

        <button type="button" className="ludo-link-btn" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}
