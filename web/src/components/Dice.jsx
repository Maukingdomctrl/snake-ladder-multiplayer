import { useState, useEffect, useRef } from "react";

export default function Dice({ onRoll, disabled, lastDice, rollKey }) {
  const [face, setFace] = useState(1);
  const [rolling, setRolling] = useState(false);
  const shuffleRef = useRef(null);

  // Trigger animation for ALL players when a new roll occurs (detected via rollKey)
  useEffect(() => {
    if (!lastDice || !rollKey) return;
    
    setRolling(true);
    let count = 0;
    
    // Start the visual shuffle
    shuffleRef.current = setInterval(() => {
      setFace(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 18) clearInterval(shuffleRef.current);
    }, 120);
    
    // Stop shuffle and snap to final face
    const timeoutId = setTimeout(() => {
      clearInterval(shuffleRef.current);
      setFace(lastDice);
      setRolling(false);
    }, 3000);

    // Cleanup intervals/timeouts on unmount
    return () => {
      clearInterval(shuffleRef.current);
      clearTimeout(timeoutId);
    };
  }, [rollKey, lastDice]);

  const handleRoll = async () => {
    if (disabled || rolling) return;
    await onRoll();
  };

  const diceFaces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  return (
    <div style={{ marginTop: 8, marginLeft: 8, display: "flex", alignItems: "center", gap: 12 }}>
      <div 
        style={{ 
          fontSize: 48, 
          lineHeight: 1,
          opacity: disabled && !rolling ? 0.5 : 1,
          transition: "opacity 0.2s"
        }}
      >
        {diceFaces[face - 1] || "⚀"}
      </div>
      
      <button onClick={handleRoll} disabled={disabled || rolling}>
        {rolling ? "Rolling..." : "Roll Dice"}
      </button>
    </div>
  );
}