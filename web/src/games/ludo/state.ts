// What the player can do right now, derived from the authoritative room and
// the local animation stage. One value instead of scattered booleans, so the
// UI can never be "my turn" and "animating" at the same time.
import type { LudoColor, LudoGame, LudoRoom } from "./types";

export type PresentationStage = "idle" | "rolling" | "moving";

export type LobbyPhase = "waiting-for-players" | "waiting-for-ready" | "ready";

export type UiPhase =
  | { kind: "lobby"; lobby: LobbyPhase }
  | { kind: "animating"; color: LudoColor | null }
  | { kind: "my-roll" }
  | { kind: "my-move"; legal: number[]; dice: number }
  | { kind: "their-turn"; color: LudoColor; phase: "roll" | "move" }
  | { kind: "spectating" }
  | { kind: "finished"; winnerId: string | null };

export const COLOR_LABEL: Record<LudoColor, string> = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };
export const COLOR_EMOJI: Record<LudoColor, string> = { red: "🔴", green: "🟢", yellow: "🟡", blue: "🔵" };

export function lobbyPhase(room: LudoRoom): LobbyPhase {
  const { seats, settings } = room.ludo;
  if (seats.length < settings.maxPlayers) return "waiting-for-players";
  if (!seats.every((s) => s.ready)) return "waiting-for-ready";
  return "ready";
}

export function currentPlayerId(game: LudoGame): string | null {
  return game.players.find((p) => p.color === game.turn.color)?.id ?? null;
}

export function deriveUiPhase(
  room: LudoRoom,
  playerId: string,
  stage: PresentationStage,
  actorColor: LudoColor | null
): UiPhase {
  if (room.status === "waiting" || !room.ludo.game) return { kind: "lobby", lobby: lobbyPhase(room) };
  const game = room.ludo.game;
  if (stage !== "idle") return { kind: "animating", color: actorColor };
  if (game.status === "finished") return { kind: "finished", winnerId: game.winnerId };
  const me = game.players.find((p) => p.id === playerId);
  if (!me || me.status === "left") return { kind: "spectating" };
  const { turn } = game;
  if (turn.phase === "over") return { kind: "finished", winnerId: game.winnerId };
  if (turn.color !== me.color) return { kind: "their-turn", color: turn.color, phase: turn.phase };
  if (turn.phase === "roll") return { kind: "my-roll" };
  return { kind: "my-move", legal: turn.legal, dice: turn.dice ?? 0 };
}

/** "Red — Player 1", so colour is never the only cue. */
export function seatLabel(color: LudoColor, seatNumber: number): string {
  return `${COLOR_LABEL[color]} — Player ${seatNumber}`;
}
