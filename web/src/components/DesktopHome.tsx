import { useState, type CSSProperties } from "react";
import type { LoginScreenProps } from "./LoginScreen";

const GAMES = [
  {
    id: "snakes",
    label: "Snakes & Ladders",
    description: "Big climbs. Unexpected slides.",
    icon: "↗",
  },
  {
    id: "ludo",
    label: "Ludo",
    description: "A classic. A little competition.",
    icon: "✣",
  },
] as const;

function ArrowIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Dice({ className = "" }: { className?: string }) {
  return (
    <div className={`gh-dice ${className}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={[0, 2, 4, 6, 8].includes(i) ? "is-dot" : ""}
        />
      ))}
    </div>
  );
}

function BoardArtwork() {
  return (
    <div className="gh-art" aria-hidden="true">
      <div className="gh-art__halo" />

      <div className="gh-board">
        <div className="gh-board__grid">
          {Array.from({ length: 36 }, (_, i) => {
            const row = Math.floor(i / 6);
            const column = i % 6;
            const number =
              (5 - row) * 6 + (row % 2 === 0 ? 6 - column : column + 1);

            return (
              <div
                key={i}
                className={`gh-board__cell ${
                  (row + column) % 2 === 0 ? "is-light" : ""
                }`}
              >
                <span>{number}</span>
                {number === 36 && <b>★</b>}
              </div>
            );
          })}
        </div>

        <svg
          className="gh-board__paths"
          viewBox="0 0 360 360"
          fill="none"
        >
          {/* Ladder */}
          <g
            stroke="#e9ff95"
            strokeWidth="7"
            strokeLinecap="round"
            transform="rotate(31 140 195)"
          >
            <path d="M123 100v190M155 100v190" />
            {[118, 145, 172, 199, 226, 253, 280].map((y) => (
              <path key={y} d={`M123 ${y}h32`} />
            ))}
          </g>

          {/* Snake */}
          <path
            d="M265 75c-64 0-63 65-22 89s43 79-17 105"
            stroke="#121922"
            strokeWidth="23"
            strokeLinecap="round"
            opacity=".2"
            transform="translate(3 6)"
          />
          <path
            d="M265 75c-64 0-63 65-22 89s43 79-17 105"
            stroke="#b4a0ff"
            strokeWidth="19"
            strokeLinecap="round"
          />
          <circle cx="266" cy="75" r="14" fill="#c4b4ff" />
          <circle cx="271" cy="71" r="2.5" fill="#181b27" />
        </svg>

        <div className="gh-pawn gh-pawn--lime" />
        <div className="gh-pawn gh-pawn--pink" />
      </div>

      <Dice className="gh-dice--floating" />

      <div className="gh-art-label gh-art-label--top">
        <span className="gh-spark">✦</span>
        Good times, one roll away.
      </div>

      <div className="gh-art-label gh-art-label--bottom">
        <span className="gh-mini-avatars">
          <i>J</i>
          <i>A</i>
          <i>Y</i>
        </span>
        <span>Your next game night starts here.</span>
      </div>
    </div>
  );
}

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
    <main className="gaming-home">
      <div className="gh-shell">
        <header className="gh-header">
          <a className="gh-brand" href="#home" aria-label="GoodGame home">
            <span className="gh-brand__icon">
              <Dice />
            </span>
            goodgame<span className="gh-brand__period">.</span>
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
            <div className="gh-eyebrow">
              <span className="gh-live-dot" />
              YOUR PEOPLE. YOUR GAME NIGHT.
            </div>

            <h1>
              Old-school games.
              <br />
              <span>New memories.</span>
            </h1>

            <p className="gh-intro__description">
              Bring your friends. Pick a classic. Let the friendly rivalry
              begin — right here in your browser.
            </p>

            <div className="gh-perks">
              <span>
                <b>↗</b> Instant rooms
              </span>
              <span>
                <b>◎</b> Play with friends
              </span>
              <span>
                <b>✓</b> No downloads
              </span>
            </div>

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

        <section className="gh-games" id="games" aria-labelledby="games-heading">
          <div className="gh-section-heading">
            <div>
              <span className="gh-section-label">THE CLASSICS, RECONNECTED</span>
              <h2 id="games-heading">Small collection. Endless rematches.</h2>
            </div>
            <span className="gh-section-aside">Good company encouraged ↗</span>
          </div>

          <div className="gh-game-tiles">
            {GAMES.map((item, index) => (
              <a
                key={item.id}
                href="#play"
                className={`gh-game-tile gh-game-tile--${item.id}`}
                onClick={() => {
                  if (!loading) setGame(item.id);
                }}
              >
                <div className="gh-game-tile__art" aria-hidden="true">
                  {item.id === "snakes" ? (
                    <>
                      <span className="gh-tile-ladder">↗</span>
                      <span className="gh-tile-snake">〰</span>
                    </>
                  ) : (
                    <div className="gh-ludo-mark">
                      {["#b4ed72", "#c2a5ff", "#ffb785", "#f28dac"].map(
                        (color) => (
                          <i
                            key={color}
                            style={{ "--piece": color } as CSSProperties}
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>

                <div className="gh-game-tile__copy">
                  <span className="gh-tile-number">0{index + 1} / CLASSIC</span>
                  <h3>{item.label}</h3>
                  <p>{item.description}</p>
                </div>

                <span className="gh-tile-arrow">
                  <ArrowIcon />
                </span>
              </a>
            ))}
          </div>
        </section>

        <section
          className="gh-how"
          id="how-to-play"
          aria-label="How to start playing"
        >
          {[
            ["01", "Pick your classic", "Choose a game and enter your name."],
            ["02", "Get the gang together", "Create a room and share its code."],
            ["03", "Let the good times roll", "Friends join. Game night begins."],
          ].map(([number, title, description]) => (
            <div className="gh-step" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="gh-footer">
          <span>goodgame.</span>
          <p>Made for “just one more round.”</p>
          <a href="#home">Back to top ↑</a>
        </footer>
      </div>
    </main>
  );
}
