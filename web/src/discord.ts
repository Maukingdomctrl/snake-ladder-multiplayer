import { DiscordSDK, DiscordSDKMock } from "@discord/embedded-app-sdk";

// 1. Properly parse search parameters first
const params = new URLSearchParams(window.location.search);

// 2. Expand detection to catch all Discord Activity entry query points
const isDiscord =
  window.location.hostname.includes("discordsays.com") ||
  params.has("frame_id") ||
  params.has("instance_id") ||
  params.has("guild_id") ||
  params.has("channel_id");

// 3. Log values safely after declaration
console.log("DISCORD CLIENT ID:", import.meta.env.VITE_DISCORD_CLIENT_ID);
console.log("hostname:", window.location.hostname);
console.log("search:", window.location.search);
console.log("isDiscord calculated:", isDiscord);

export { isDiscord };

export const discordSdk = isDiscord
  ? new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)
  : new DiscordSDKMock(import.meta.env.VITE_DISCORD_CLIENT_ID, null, null);

export type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
  discriminator: string;
};

let resolvedUser: DiscordUser | null = null;

export async function setupDiscord(): Promise<DiscordUser | null> {
  try {
    console.log("Waiting for discordSdk.ready()...");
    await discordSdk.ready();
    console.log("Discord Activity Ready");

    if (!isDiscord) return null;

    // Authorize with Discord
    const { code } = await discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    });
    
    console.log("Discord authorized safely. Auth code obtained:", code);

    // NOTE: To fetch real participant information safely, you must pass 'code' to your 
    // backend/Firebase Function to exchange it for an access_token, then run authenticate().
    // For now, we wrap this in a try/catch block so a failure does not crash the entire app setup.
    try {
      const participants = await discordSdk.commands.getInstanceConnectedParticipants();
      resolvedUser = participants?.participants?.[0] ?? null;
    } catch (participantError) {
      console.warn("Could not fetch participants without full backend authentication token:", participantError);
    }

    return resolvedUser;
  } catch (e) {
    console.error("Discord setup failed root catch:", e);
    return null;
  }
}

export function getDiscordUser() {
  return resolvedUser;
}