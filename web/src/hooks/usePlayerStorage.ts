import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
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

export async function signInWithGoogle() {
  await signInWithPopup(auth, googleProvider);
}

export async function signOut() {
  await fbSignOut(auth);
}

/** The signed-in Google user drives identity: playerId is the Firebase uid. */
export function usePlayerStorage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [playerName, setPlayerName] = useState<string>(
    () => safeLocalStorage.getItem("playerName") || ""
  );
  const [playerColor, setPlayerColor] = useState<string>(
    () => safeLocalStorage.getItem("playerColor") || LOBBY_COLORS[0]
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
        if (u && !safeLocalStorage.getItem("playerName")) {
          setPlayerName((u.displayName || "").split(" ")[0].slice(0, 20));
        }
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
    playerId: user?.uid ?? "",
    playerName,
    setPlayerName,
    playerColor,
    setPlayerColor,
  };
}
