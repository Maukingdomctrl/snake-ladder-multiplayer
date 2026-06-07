import { useState, useEffect } from "react";
import { getDiscordUser } from "../discord"; // Adjust path if needed
import { LOBBY_COLORS } from "../constants";

export function usePlayerStorage() {
  const [playerId] = useState<string>(() => {
    const discordUser = getDiscordUser();
    if (discordUser?.id) return `discord_${discordUser.id}`;
    
    let id = localStorage.getItem("playerId");
    if (!id) {
      id = `p_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("playerId", id);
    }
    return id;
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    const discordUser = getDiscordUser();
    if (discordUser?.username) return discordUser.username;
    return localStorage.getItem("playerName") || "";
  });

  const [playerColor, setPlayerColor] = useState<string>(
    () => localStorage.getItem("playerColor") || LOBBY_COLORS[0]
  );

  useEffect(() => {
    localStorage.setItem("playerName", playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem("playerColor", playerColor);
  }, [playerColor]);

  return { playerId, playerName, setPlayerName, playerColor, setPlayerColor };
}