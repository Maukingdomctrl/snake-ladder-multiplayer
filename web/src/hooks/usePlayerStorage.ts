import { useState, useEffect } from "react";
import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import { auth } from "../firebase";
import { LOBBY_COLORS } from "../constants";

// Safe localStorage wrapper so Incognito/Private mode doesn't crash the app
const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore write errors (quota exceeded, private mode)
    }
  },
};

/**
 * Players are signed in silently as Firebase anonymous users (no account
 * needed); playerId is that uid, which persists in this browser.
 */
export function usePlayerStorage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [playerName, setPlayerName] = useState<string>(
    () => safeLocalStorage.getItem("playerName") || ""
  );
  const [playerColor, setPlayerColor] = useState<string>(
    () => safeLocalStorage.getItem("playerColor") || LOBBY_COLORS[0]
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) {
          setUser(u);
          setAuthReady(true);
          return;
        }
        signInAnonymously(auth).catch((e) => {
          console.error("Anonymous sign-in failed:", e);
          setAuthError("Couldn't connect. Please refresh the page.");
          setAuthReady(true);
        });
      }),
    []
  );

  useEffect(() => {
    safeLocalStorage.setItem("playerName", playerName);
  }, [playerName]);

  useEffect(() => {
    safeLocalStorage.setItem("playerColor", playerColor);
  }, [playerColor]);

  return {
    user,
    authReady,
    authError,
    playerId: user?.uid ?? "",
    playerName,
    setPlayerName,
    playerColor,
    setPlayerColor,
  };
}
