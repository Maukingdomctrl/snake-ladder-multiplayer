import { useState, useEffect } from "react";
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken, User } from "firebase/auth";
import { auth } from "../firebase";
import { fetchGuestToken } from "../firebase/rooms";
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

// Direct anonymous sign-in is tried first. If Firebase refuses it (flaky
// network, or a shared VPN address that hit the per-IP sign-up limit), fall
// back to a guest token issued by our own server.
async function signInGuest(onFail?: (msg: string) => void): Promise<void> {
  let code = "unknown";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await signInAnonymously(auth);
      return;
    } catch (e) {
      code = (e as { code?: string })?.code || code;
      console.error(`Anonymous sign-in failed (attempt ${attempt}):`, e);
      if (code !== "auth/network-request-failed") break; // retrying won't help
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  try {
    await signInWithCustomToken(auth, await fetchGuestToken());
  } catch (e) {
    console.error("Guest token sign-in failed:", e);
    const fallbackCode = (e as { code?: string })?.code;
    onFail?.(`Couldn't connect (${code}${fallbackCode ? `, ${fallbackCode}` : ""}). Please refresh the page.`);
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
  // Game picked on the join screen (what "Create room" makes)
  const [selectedGame, setSelectedGame] = useState<"snakes" | "ludo">(() =>
    safeLocalStorage.getItem("selectedGame") === "ludo" ? "ludo" : "snakes"
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) {
          setUser(u);
          setAuthReady(true);
          return;
        }
        signInGuest((msg) => {
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

  useEffect(() => {
    safeLocalStorage.setItem("selectedGame", selectedGame);
  }, [selectedGame]);

  return {
    user,
    authReady,
    authError,
    playerId: user?.uid ?? "",
    playerName,
    setPlayerName,
    playerColor,
    setPlayerColor,
    selectedGame,
    setSelectedGame,
  };
}
