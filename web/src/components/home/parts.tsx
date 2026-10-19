// Pieces of the arcade home page shared by DesktopHome (wide windows with a
// mouse) and MobileHome (phones and tablets). Styles: home.css.
import type { CSSProperties, ElementType } from "react";

export type GameId = "snakes" | "ludo";

export const GAMES = [
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

export function ArrowIcon() {
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

export function Dice({ className = "" }: { className?: string }) {
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

/** "goodgame." wordmark with the dice icon. */
export function Wordmark() {
  return (
    <>
      <span className="gh-brand__icon">
        <Dice />
      </span>
      goodgame<span className="gh-brand__period">.</span>
    </>
  );
}

/** Eyebrow, headline, description and perks. Desktop uses an h1; phones keep
 *  the selected game as the page's h1 and show this headline as an h2. */
export function HomeIntro({ titleAs: Title = "h1" }: { titleAs?: ElementType }) {
  return (
    <>
      <div className="gh-eyebrow">
        <span className="gh-live-dot" />
        YOUR PEOPLE. YOUR GAME NIGHT.
      </div>

      <Title className="gh-headline">
        Old-school games.
        <br />
        <span>New memories.</span>
      </Title>

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
    </>
  );
}

export function BoardArtwork() {
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

/** One tile per game. Tapping a tile picks that game and jumps to `href`
 *  (the room card on desktop, the top of the page on phones). */
export function GameTiles({
  href,
  loading,
  setGame,
}: {
  href: string;
  loading: boolean;
  setGame: (game: GameId) => void;
}) {
  return (
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
            href={href}
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
  );
}

export function HowToPlay() {
  return (
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
  );
}

export function HomeFooter() {
  return (
    <footer className="gh-footer">
      <span>goodgame.</span>
      <p>Made for “just one more round.”</p>
      <a href="#home">Back to top ↑</a>
    </footer>
  );
}
