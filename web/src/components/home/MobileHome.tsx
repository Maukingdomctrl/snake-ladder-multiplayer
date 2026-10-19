import { useState } from "react";
import type { LoginScreenProps } from "../LoginScreen";
import {
  ArrowIcon,
  BoardArtwork,
  GAMES,
  GameTiles,
  HomeFooter,
  HomeIntro,
  HowToPlay,
  Wordmark,
} from "./parts";
import "./home.css";

interface MobileHomeProps extends LoginScreenProps {
  /** Where the room card starts and its minimum height. LoginScreen measures
   *  both once on mount so the card never moves when the keyboard opens. */
  cardTop: number;
  cardMinHeight: number;
}

// Phones and tablets: the desktop home page's arcade design in one column.
// The room card comes first, in the upper part of the screen that the
// keyboard leaves free; the artwork and the rest sit below it, where the
// keyboard goes. Shared pieces live in parts.tsx.
export default function MobileHome({
  ready,
  playerName,
  setPlayerName,
  joinId,
  setJoinId,
  error,
  loading,
  onCreateRoom,
  onJoinRoom,
  game,
  setGame,
  cardTop,
  cardMinHeight,
}: MobileHomeProps) {
  const [action, setAction] = useState<"create" | "join" | null>(null);
  const busy = loading || !ready;

  // Name and code are checked by App, which explains what's missing.
  function create() {
    if (busy) return;
    setAction("create");
    onCreateRoom();
  }

  function join() {
    if (busy) return;
    setAction("join");
    onJoinRoom();
  }

  return (
    <main className="gaming-home gaming-home--mobile">
      <div className="gh-m-shell" id="home" style={{ paddingTop: cardTop }}>
        <section
          className="gh-play-card gh-m-card"
          id="play"
          aria-labelledby="play-heading"
          aria-busy={loading}
          style={{ minHeight: cardMinHeight }}
        >
          <h1 id="play-heading" className="sr-only">
            {game === "ludo" ? "Ludo" : "Snakes & Ladders"}
          </h1>

          <div className="gh-m-card__top">
            <span className="gh-m-brand" aria-hidden="true">
              <Wordmark />
            </span>
            <span
              className={`gh-connection ${ready ? "is-ready" : ""}`}
              role="status"
            >
              <i />
              {ready ? "Ready when you are" : "Connecting…"}
            </span>
          </div>

          <div className="gh-m-games" role="radiogroup" aria-label="Game">
            {GAMES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={game === item.id}
                className={`gh-m-game${game === item.id ? " is-selected" : ""}`}
                disabled={loading}
                onClick={() => setGame(item.id)}
              >
                <span
                  className={`gh-game-option__icon gh-game-option__icon--${item.id}`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="gh-m-game__name">{item.label}</span>
              </button>
            ))}
          </div>

          <input
            className="gh-input"
            placeholder="Your name"
            aria-label="Your name"
            autoComplete="nickname"
            maxLength={20}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                create();
              }
            }}
          />

          <button
            type="button"
            className="gh-create-button"
            onClick={create}
            disabled={busy}
          >
            <span>
              {loading && action === "create"
                ? "Creating…"
                : game === "ludo"
                  ? "Create Ludo room"
                  : "Create room"}
            </span>
            <ArrowIcon />
          </button>

          <div className="gh-divider" role="separator">
            <span>or join a friend</span>
          </div>

          <form
            className="gh-join-row"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <input
              className="gh-input gh-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="Room code"
              aria-label="Room code"
              value={joinId}
              onChange={(e) =>
                setJoinId(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            <button className="gh-join-button" type="submit" disabled={busy}>
              {loading && action === "join" ? "Joining…" : "Join"}
              <ArrowIcon />
            </button>
          </form>

          {error && (
            <p className="gh-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="gh-intro gh-m-intro" aria-label="About goodgame">
          <HomeIntro titleAs="h2" />
          <BoardArtwork />
        </section>

        <GameTiles href="#home" loading={loading} setGame={setGame} />

        <HowToPlay />

        <HomeFooter />
      </div>
    </main>
  );
}
