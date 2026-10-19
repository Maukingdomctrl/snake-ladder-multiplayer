import { useState } from "react";
import DesktopHome from "./home/DesktopHome";
import MobileHome from "./home/MobileHome";

export interface LoginScreenProps {
  ready: boolean;
  playerName: string;
  setPlayerName: (name: string) => void;
  joinId: string;
  setJoinId: (id: string) => void;
  error: string;
  loading: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  /** Which game "Create room" starts. Joining follows the room code. */
  game: "snakes" | "ludo";
  setGame: (game: "snakes" | "ludo") => void;
}

export default function LoginScreen(props: LoginScreenProps) {
  // Measured once, so nothing moves when the keyboard opens. The keyboard
  // covers roughly the lower half of a phone screen: the room card sits in
  // the upper half and stretches down to just above where the keyboard starts.
  const [layout] = useState(() => {
    const h = window.innerHeight;
    const keyboardTop = h * 0.48 - 24;
    const top = Math.max(20, Math.min(h * 0.15, keyboardTop - 300));
    const minHeight = Math.max(300, Math.min(440, keyboardTop - top));
    // Desktop (mouse, wide window) has no on-screen keyboard.
    const desktop = window.innerWidth >= 1024 && (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false);
    return { top: Math.round(top), minHeight: Math.round(minHeight), desktop };
  });

  // Both are the arcade home page (components/home). Phones and tablets get
  // the one-column version with the keyboard-stable room card.
  if (layout.desktop) return <DesktopHome {...props} />;
  return <MobileHome {...props} cardTop={layout.top} cardMinHeight={layout.minHeight} />;
}
