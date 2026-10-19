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

// Desktop home page (wide window with a mouse; LoginScreen decides).
// Phones and tablets get MobileHome. Shared pieces live in parts.tsx.

export default function DesktopHome({
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
}: LoginScreenProps) {
  const [action, setAction] = useState<"create" | "join" | null>(null);

  const hasName = playerName.trim().length > 0;
  const canCreate = ready && !loading && hasName;
  const canJoin = canCreate && /^\d{4}$/.test(joinId);

  function create() {
    if (!canCreate) return;
    setAction("create");
    onCreateRoom();
  }

  function join() {
    if (!canJoin) return;
    setAction("join");
    onJoinRoom();
  }

  return (
    <main className="gaming-home gaming-home--desktop">
      <div className="gh-shell">
        <header className="gh-header">
          <a className="gh-brand" href="#home" aria-label="GoodGame home">
            <Wordmark />
          </a>

          <nav className="gh-nav" aria-label="Main navigation">
            <a href="#games">The games</a>
            <a href="#how-to-play">How to play</a>
          </nav>

          <div className="gh-header-note">
            <span />
            Less scrolling. More playing.
          </div>
        </header>

        <section className="gh-hero" id="home">
          <div className="gh-intro">
            <HomeIntro />

            <BoardArtwork />
          </div>

          <section
            className="gh-play-card"
            id="play"
            aria-labelledby="play-heading"
            aria-busy={loading}
          >
            <div className="gh-play-card__top">
              <span className="gh-section-label">LET’S PLAY</span>
              <span
                className={`gh-connection ${ready ? "is-ready" : ""}`}
                role="status"
              >
                <i />
                {ready ? "Ready when you are" : "Connecting…"}
              </span>
            </div>

            <h2 id="play-heading">Make room for fun.</h2>
            <p className="gh-card-description">
              Start something good. Invite your favorite people.
            </p>

            <fieldset className="gh-game-picker" disabled={loading}>
              <legend>01 — Pick your game</legend>

              <div className="gh-game-options">
                {GAMES.map((item) => (
                  <label
                    key={item.id}
                    className={`gh-game-option ${
                      game === item.id ? "is-selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="home-game"
                      value={item.id}
                      checked={game === item.id}
                      onChange={() => setGame(item.id)}
                    />

                    <span
                      className={`gh-game-option__icon gh-game-option__icon--${item.id}`}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>

                    <span className="gh-game-option__name">{item.label}</span>
                    <span className="gh-game-option__radio" />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="gh-name-field">
              <label className="gh-field-label" htmlFor="gh-player-name">
                02 — What should we call you?
              </label>

              <input
                id="gh-player-name"
                className="gh-input"
                placeholder="Enter your name"
                autoComplete="nickname"
                maxLength={20}
                value={playerName}
                disabled={loading}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    create();
                  }
                }}
              />
            </div>

            <button
              type="button"
              className="gh-create-button"
              onClick={create}
              disabled={!canCreate}
            >
              <span>
                {loading && action === "create"
                  ? "Creating your room…"
                  : "Create a room"}
              </span>
              <ArrowIcon />
            </button>

            <p className="gh-create-note">
              {game === "ludo" ? "Ludo" : "Snakes & Ladders"} · A room code
              brings everyone together
            </p>

            <div className="gh-divider">
              <span>already have an invite?</span>
            </div>

            <form
              className="gh-join-form"
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <label className="gh-field-label" htmlFor="gh-room-code">
                Join your friends
              </label>

              <div className="gh-join-row">
                <input
                  id="gh-room-code"
                  className="gh-input gh-code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="4-digit code"
                  value={joinId}
                  disabled={loading}
                  aria-describedby="gh-join-help"
                  onChange={(e) =>
                    setJoinId(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                />

                <button
                  className="gh-join-button"
                  type="submit"
                  disabled={!canJoin}
                >
                  {loading && action === "join" ? "Joining…" : "Join"}
                  <ArrowIcon />
                </button>
              </div>

              <p id="gh-join-help" className="gh-join-help">
                Enter your name above. The code chooses the game.
              </p>
            </form>

            {error && (
              <p className="gh-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </section>

        <GameTiles href="#play" loading={loading} setGame={setGame} />

        <HowToPlay />

        <HomeFooter />
      </div>
    </main>
  );
}
