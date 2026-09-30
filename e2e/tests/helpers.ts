import { expect, type Browser, type Page } from "@playwright/test";

export const PHONE = { width: 412, height: 820 };
export const SMALL_PHONE = { width: 360, height: 700 };

/** A fresh player (own browser context = own anonymous account) on the join screen. */
export async function newPlayer(browser: Browser, name: string, viewport = PHONE): Promise<Page> {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 700 });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill(name);
  return page;
}

/** Host creates a Ludo room for `names.length` players, the rest join and get ready. */
export async function ludoRoom(browser: Browser, names: string[], { start = true, viewports = [] as { width: number; height: number }[] } = {}) {
  const host = await newPlayer(browser, names[0], viewports[0]);
  await host.getByRole("radio", { name: "Ludo" }).click();
  await host.getByRole("button", { name: "Create Ludo room" }).click();
  const code = (await host.locator(".ludo-code__value").textContent())!.trim();
  await host.getByRole("radio", { name: `${names.length} players` }).click();
  const pages = [host];
  for (const [i, name] of names.slice(1).entries()) {
    const page = await newPlayer(browser, name, viewports[i + 1]);
    await page.getByPlaceholder("Room code").fill(code);
    await page.getByRole("button", { name: "Join" }).click();
    await page.getByRole("button", { name: "I'm ready" }).click();
    pages.push(page);
  }
  if (start) {
    await host.getByRole("button", { name: "Start game" }).click();
    for (const page of pages) await expect(page.locator(".ludo-board")).toBeVisible();
  }
  return { code, pages };
}

/** Every token as a client shows it (colour, number, place). */
export function tokenLabels(page: Page) {
  return page.locator(".ludo-token").evaluateAll((els) =>
    els.map((e) => (e.getAttribute("aria-label") ?? "").replace(", can move", "")).sort()
  );
}

/**
 * Takes one action on whichever client may act right now (roll or pick the
 * first legal token). Clicks are dispatched directly: Playwright's
 * scroll-and-retry would otherwise nudge the page.
 */
export async function playOne(pages: Page[]): Promise<"roll" | "move" | null> {
  for (const page of pages) {
    const roll = page.getByRole("button", { name: "Roll the dice" });
    if (await roll.isEnabled().catch(() => false)) {
      await roll.click({ force: true });
      return "roll";
    }
    const pick = page.locator(".ludo-pick").first();
    if ((await pick.isVisible().catch(() => false)) && (await pick.isEnabled().catch(() => false))) {
      await pick.click({ force: true });
      return "move";
    }
  }
  return null;
}

/** Waits until every client has finished animating and shows the same tokens. */
export async function expectInSync(pages: Page[]) {
  await expect
    .poll(
      async () => {
        const all = await Promise.all(pages.map(tokenLabels));
        return all.every((labels) => JSON.stringify(labels) === JSON.stringify(all[0]));
      },
      { timeout: 20_000, intervals: [500] }
    )
    .toBe(true);
}

// ── Seeding positions through the Firestore emulator ──────────────────────
// Tests reach specific positions (a capture, a near-win) by editing the room
// as the emulator's "owner". Dice still come from the game server.

const DOCS = "http://127.0.0.1:8080/v1/projects/demo-snake-ladder/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Value = Record<string, unknown>;

function decode(v: Value): Json {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue as boolean;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue as number;
  if ("stringValue" in v) return v.stringValue as string;
  if ("timestampValue" in v) return v.timestampValue as string;
  if ("arrayValue" in v) return ((v.arrayValue as { values?: Value[] }).values ?? []).map(decode);
  const fields = (v.mapValue as { fields?: Record<string, Value> }).fields ?? {};
  return Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, decode(x)]));
}

function encode(x: Json): Value {
  if (x === null) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, encode(v)])) } };
}

export async function readRoom(code: string): Promise<any> {
  const res = await fetch(`${DOCS}/rooms/${code}`, { headers: OWNER });
  const doc = (await res.json()) as { fields: Record<string, Value> };
  return Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, decode(v)]));
}

/** Edits the room's Ludo state and bumps its version, as a server write would. */
export async function seedLudo(code: string, change: (ludo: any) => void) {
  const room = await readRoom(code);
  change(room.ludo);
  const body = { fields: { ludo: encode(room.ludo), version: encode(room.version + 1) } };
  const res = await fetch(`${DOCS}/rooms/${code}?updateMask.fieldPaths=ludo&updateMask.fieldPaths=version`, {
    method: "PATCH",
    headers: OWNER,
    body: JSON.stringify(body),
  });
  expect(res.ok).toBe(true);
}

/** The page of the player whose turn it is. */
export async function currentPage(code: string, pages: Page[], names: string[]) {
  const room = await readRoom(code);
  const game = room.ludo.game;
  const id = game.players.find((p: { color: string }) => p.color === game.turn.color).id;
  return { page: pages[names.indexOf(room.playerNames[id])], color: game.turn.color as string };
}
