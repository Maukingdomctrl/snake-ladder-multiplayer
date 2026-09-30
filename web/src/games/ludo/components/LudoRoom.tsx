import { useCallback, useEffect, useState } from "react";
import "../ludo.css";
import { loadSoundPreference, saveSoundPreference } from "../sound";
import type { useLudoRoom } from "../useLudoRoom";
import LudoGameView from "./LudoGameView";
import LudoLobby from "./LudoLobby";

type Props = {
  ludo: ReturnType<typeof useLudoRoom>;
  playerId: string;
};

/** The Ludo room screen: lobby before the game, board during and after it. */
export default function LudoRoom({ ludo, playerId }: Props) {
  const { room, offline, pending, error, clearError, act, leave, serverNow } = ludo;
  const [sound, setSound] = useState(loadSoundPreference);

  const toggleSound = useCallback(() => {
    setSound((on) => {
      saveSoundPreference(!on);
      return !on;
    });
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 4000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  return (
    <div className="ludo-room">
      {offline && (
        <div className="ludo-offline" role="status">
          Connection lost — reconnecting…
        </div>
      )}
      {error && (
        <div className="ludo-toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {!room ? (
        <div className="ludo-loading">Joining room…</div>
      ) : room.status === "waiting" || !room.ludo.game ? (
        <LudoLobby room={room} playerId={playerId} pending={pending} act={act} onLeave={leave} />
      ) : (
        <LudoGameView
          room={room}
          playerId={playerId}
          pending={pending}
          act={act}
          onLeave={leave}
          serverNow={serverNow}
          sound={sound}
          onToggleSound={toggleSound}
        />
      )}
    </div>
  );
}
