import { useState, useEffect, useRef } from "react";

const diceFaces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function Dice({ onRoll, disabled, lastDice, rollKey, onRollComplete }) {
  const [face, setFace] = useState(lastDice || 1);
  const [rolling, setRolling] = useState(false);
  const processedRollKeyRef = useRef("");
  const onRollCompleteRef = useRef(onRollComplete);
  const timeoutsRef = useRef([]);

  useEffect(() => {
    onRollCompleteRef.current = onRollComplete;
  }, [onRollComplete]);

  // Sync face when idle (late join / page reload)
  useEffect(() => {
    if (!rolling && lastDice) setFace(lastDice);
  }, [lastDice, rolling]);

  useEffect(() => {
    if (!lastDice || !rollKey) return;
    if (processedRollKeyRef.current === rollKey) return;
    processedRollKeyRef.current = rollKey;

    // Kill any previous animation
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setRolling(true);

    const DURATION = 3000;
    const schedule = [];

    // Build schedule: rapid at start, slow at end
    let t = 0;
    let interval = 80;
    while (t < DURATION) {
      schedule.push(t);
      // gradually increase interval from 80ms to 400ms
      interval = Math.min(400, interval + interval * 0.08);
      t += interval;
    }
    // Always end exactly at DURATION
    schedule.push(DURATION);

    schedule.forEach((time, i) => {
      const isLast = i === schedule.length - 1;
      const id = setTimeout(() => {
        if (isLast) {
          setFace(lastDice);
          setRolling(false);
          onRollCompleteRef.current?.();
        } else {
          setFace((prev) => {
            let next;
            do {
              next = Math.floor(Math.random() * 6) + 1;
            } while (next === prev);
            return next;
          });
        }
      }, time);
      timeoutsRef.current.push(id);
    });

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [rollKey, lastDice]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          fontSize: 56,
          lineHeight: 1,
          opacity: disabled && !rolling ? 0.4 : 1,
          filter: rolling ? "drop-shadow(0 0 8px var(--accent))" : "none",
          transition: "filter 0.2s, opacity 0.2s",
          userSelect: "none",
        }}
      >
        {diceFaces[face - 1]}
      </div>
      <button
        className="btn-primary"
        onClick={async () => {
          if (!disabled && !rolling) await onRoll();
        }}
        disabled={disabled || rolling}
        style={{ minHeight: 44, minWidth: 100 }}
      >
        {rolling ? "Rolling..." : "Roll Dice"}
      </button>
    </div>
  );
}
