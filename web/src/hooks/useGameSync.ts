import { useState, useEffect, useRef } from "react";
import { finalizeGameStart } from "../firebase/rooms";
import type { Room } from "../firebase/rooms";

export function useGameSync(roomData: Room | null) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const finalizeCalledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!roomData || roomData.status !== "countdown" || !roomData.countdownEndsAt) {
      setCountdown(null);
      finalizeCalledRef.current = false;
      return;
    }

    const tick = async () => {
      const leftMs = Math.max(0, roomData.countdownEndsAt! - Date.now());
      const sec = Math.ceil(leftMs / 1000);
      setCountdown(sec);

      if (leftMs <= 0 && !finalizeCalledRef.current && roomData?.id) {
        finalizeCalledRef.current = true;
        try {
          await finalizeGameStart(roomData.id);
        } catch (_) {}
      }
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [roomData]);

  return { countdown };
}