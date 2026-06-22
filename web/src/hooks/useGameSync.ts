import { useState, useEffect, useRef } from "react";
import { finalizeGameStart } from "../firebase/rooms";
import type { Room } from "../firebase/rooms";

export function useGameSync(roomData: Room | null, playerId?: string) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const finalizeCalledRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true); // FIX: Added to prevent state updates on unmounted component
  const isHost = roomData?.hostId === playerId;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!roomData || roomData.status !== "countdown" || !roomData.countdownEndsAt) {
      if (isMountedRef.current) setCountdown(null);
      finalizeCalledRef.current = false;
      return;
    }

    // FIX: Removed async from tick. We don't need to block the interval waiting for network.
    const tick = () => {
      if (!isMountedRef.current) return;
      
      const leftMs = Math.max(0, roomData.countdownEndsAt! - Date.now());
      const sec = Math.ceil(leftMs / 1000);
      setCountdown(sec);

      if (leftMs <= 0 && !finalizeCalledRef.current && roomData?.id && isHost) {
        finalizeCalledRef.current = true;
        
        // FIX: Fire and forget. The transaction on the server is the actual source of truth.
        finalizeGameStart(roomData.id).catch((error) => {
          console.error("Failed to finalize game start:", error);
          // Optional: finalizeCalledRef.current = false; if you want it to retry on failure
        });
      }
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [roomData, isHost]);

  return { countdown };
}