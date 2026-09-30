import { memo } from "react";
import { HOME_PROGRESS } from "../board";
import { seatLabel } from "../state";
import { PALETTE } from "../theme";
import type { LudoColor, LudoGamePlayer, LudoTokens } from "../types";

type Props = {
  players: LudoGamePlayer[];
  names: Record<string, string>;
  tokens: LudoTokens;
  turnColor: LudoColor | null;
  myId: string;
  finished: boolean;
  vertical: boolean;
};

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

function status(p: LudoGamePlayer, home: number, isTurn: boolean, finished: boolean) {
  if (p.status === "left") return "Left the game";
  if (finished && p.rank) return p.rank === 1 ? "🏆 Winner" : `${ORDINAL[p.rank]} place`;
  if (p.status === "finished") return `Finished ${ORDINAL[p.rank ?? 0]}`;
  if (isTurn) return "Playing now";
  if (p.missed > 0) return `Away · missed ${p.missed}`;
  return `${home}/4 home`;
}

/** Everyone in the game: colour, name, progress and whose turn it is. */
function LudoPlayers({ players, names, tokens, turnColor, myId, finished, vertical }: Props) {
  return (
    <ul className={`ludo-players${vertical ? " is-vertical" : ""}`} aria-label="Players">
      {players.map((p, i) => {
        const home = (tokens[p.color] ?? []).filter((t) => t === HOME_PROGRESS).length;
        const isTurn = !finished && p.color === turnColor && p.status === "active";
        const name = `${names[p.id] || "Player"}${p.id === myId ? " (You)" : ""}`;
        const text = status(p, home, isTurn, finished);
        return (
          <li
            key={p.id}
            className={`ludo-player${isTurn ? " is-turn" : ""}${p.status === "left" ? " is-left" : ""}`}
            style={{ ["--seat" as string]: PALETTE[p.color].base }}
            aria-label={`${seatLabel(p.color, i + 1)}, ${name}, ${text}`}
            aria-current={isTurn ? "true" : undefined}
          >
            <span className="ludo-player__dot" aria-hidden="true" />
            <span className="ludo-player__text" aria-hidden="true">
              <span className="ludo-player__name">{name}</span>
              <span className="ludo-player__status">{text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default memo(LudoPlayers);
