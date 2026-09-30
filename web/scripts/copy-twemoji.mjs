// Copies Twemoji SVGs into public/ so emoji are served from our own domain.
import { cpSync, existsSync } from "node:fs";

const src = "node_modules/@twemoji/svg";
if (!existsSync("public/twemoji/1f600.svg")) {
  cpSync(src, "public/twemoji", { recursive: true, filter: (p) => !p.endsWith(".json") && !p.endsWith(".md") });
}
