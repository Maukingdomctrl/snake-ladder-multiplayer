import { DiscordSDK, DiscordSDKMock } from "@discord/embedded-app-sdk";

const params = new URLSearchParams(window.location.search);

export const isDiscord =
  window.location.hostname.includes("discordsays.com") ||
  params.has("frame_id") ||
  params.has("instance_id") ||
  params.has("guild_id") ||
  params.has("channel_id");

console.log("DISCORD CLIENT ID:", import.meta.env.VITE_DISCORD_CLIENT_ID);
console.log("hostname:", window.location.hostname);
console.log("search:", window.location.search);
console.log("isDiscord calculated:", isDiscord);

export const discordSdk = isDiscord
  ? new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)
  : new DiscordSDKMock(import.meta.env.VITE_DISCORD_CLIENT_ID, null, null, null);

let resolvedUser: any = null;

export async function setupDiscord(): Promise<any> {
  try {
    await discordSdk.ready();
    console.log("Discord Activity Ready");

    if (!isDiscord) return null;

    const { code } = await discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    });

    console.log("Auth code obtained:", code);

    // Exchange code for access token via Render backend
    const tokenRes = await fetch("/render/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const { access_token } = await tokenRes.json();

    // Authenticate with Discord SDK
    const auth = await discordSdk.commands.authenticate({ access_token });
    resolvedUser = auth.user ?? null;

    console.log("Discord user resolved:", resolvedUser?.username);
    return resolvedUser;

  } catch (e) {
    console.error("Discord setup failed:", e);
    return null;
  }
}

export function getDiscordUser() {
  return resolvedUser;
}