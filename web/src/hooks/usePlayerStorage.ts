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

// Mobile networks drop requests now and then, so retry a couple of times
async function signInWithRetry(onFail?: (msg: string) => void, attempt = 1): Promise<void> {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    const code = (e as { code?: string })?.code || "unknown";
    console.error(`Anonymous sign-in failed (attempt ${attempt}):`, e);
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return signInWithRetry(onFail, attempt + 1);
    }
    onFail?.(`Couldn't connect (${code}). Please refresh the page.`);
  }
}

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
        signInWithRetry((msg) => {
          setAuthError(msg);
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
