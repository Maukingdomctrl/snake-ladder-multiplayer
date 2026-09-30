import { useEffect, useRef, useState } from "react";

type Props = {
  deadline: number | null;
  turnSeconds: number;
  serverNow: () => number;
  /** Tick in the last seconds (only for the player whose turn it is). */
  onTick?: () => void;
};

/** Countdown for the current turn, measured against the server clock. */
export default function TurnTimer({ deadline, turnSeconds, serverNow, onTick }: Props) {
  const [now, setNow] = useState(serverNow);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (deadline == null) return;
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [deadline, serverNow]);

  const seconds = deadline == null ? 0 : Math.max(0, Math.min(turnSeconds, Math.ceil((deadline - now) / 1000)));

  useEffect(() => {
    if (deadline == null || seconds > 5 || seconds === 0 || lastTickRef.current === seconds) return;
    lastTickRef.current = seconds;
    onTick?.();
  }, [seconds, deadline, onTick]);

  if (deadline == null || turnSeconds <= 0) return null;
  const low = seconds <= 10;
  return (
    <span className={`ludo-timer${low ? " is-low" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
      <span className="ludo-timer__bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${seconds / turnSeconds})` }} />
      </span>
      <span className="ludo-timer__text">{seconds <= 5 ? `${seconds}…` : `0:${String(seconds).padStart(2, "0")}`}</span>
    </span>
  );
}
