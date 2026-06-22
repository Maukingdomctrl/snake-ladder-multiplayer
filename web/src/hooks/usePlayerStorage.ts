import { useState, useEffect } from "react";
import { getDiscordUser } from "../discord";
import { LOBBY_COLORS } from "../constants";

// FIX: Safe localStorage wrapper to prevent crashes in Incognito/Private mode
const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Ignore write errors (e.g., quota exceeded, private mode)
    }
  },
};

export function usePlayerStorage() {
  const [playerId] = useState<string>(() => {
    const discordUser = getDiscordUser();
    if (discordUser?.id) return `discord_${discordUser.id}`;
    
    let id = safeLocalStorage.getItem("playerId");
    if (!id) {
      id = `p_${Math.random().toString(36).slice(2, 10)}`;
      safeLocalStorage.setItem("playerId", id);
    }
    return id;
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    const discordUser = getDiscordUser();
    if (discordUser?.username) return discordUser.username;
    return safeLocalStorage.getItem("playerName") || "";
  });

  const [playerColor, setPlayerColor] = useState<string>(
    () => safeLocalStorage.getItem("playerColor") || LOBBY_COLORS[0]
  );

  useEffect(() => {
    safeLocalStorage.setItem("playerName", playerName);
  }, [playerName]);

  useEffect(() => {
    safeLocalStorage.setItem("playerColor", playerColor);
  }, [playerColor]);

  return { playerId, playerName, setPlayerName, playerColor, setPlayerColor };
}