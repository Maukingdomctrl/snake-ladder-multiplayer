import { expect, test, type Page } from "@playwright/test";
import {
  PHONE,
  SMALL_PHONE,
  currentPage,
  expectInSync,
  ludoRoom,
  newPlayer,
  playOne,
  readRoom,
  seedLudo,
  tokenLabels,
} from "./helpers";

/** Notices currently shown on any of the clients. */
async function anyNotice(pages: Page[]) {
  return (await Promise.all(pages.map((p) => p.locator(".ludo-notice").allTextContents()))).flat().join(" | ");
}

test("two players: create, join, ready, start — everyone sees the same board", async ({ browser }) => {
  const { code, pages } = await ludoRoom(browser, ["Alice", "Bob"]);
  const [alice, bob] = pages;
  const room = await readRoom(code);
  expect(room.status).toBe("playing");
  expect(room.ludo.game.players.map((p: { color: string }) => p.color)).toEqual(["red", "yellow"]);
  const turnOf = room.playerNames[room.ludo.game.players.find((p: { color: string }) => p.color === room.ludo.game.turn.color).id];
  for (const page of pages) await expect(page.locator(".ludo-banner__text")).toContainText("turn");
  const mine = turnOf === "Alice" ? alice : bob;
  await expect(mine.locator(".ludo-banner__text")).toContainText("Your turn");
  await expect(mine.getByRole("button", { name: "Roll the dice" })).toBeEnabled();
  await expect((turnOf === "Alice" ? bob : alice).getByRole("button", { name: "Roll the dice" })).toBeDisabled();
  await expectInSync(pages);
});

for (const count of [3, 4]) {
  test(`${count} players stay in sync turn after turn`, async ({ browser }) => {
    const names = ["Ann", "Ben", "Cat", "Dan"].slice(0, count);
    const { code, pages } = await ludoRoom(browser, names);
    let actions = 0;
    const deadline = Date.now() + 70_000;
    while (actions < 24 && Date.now() < deadline) {
      if (await playOne(pages)) actions++;
      else await pages[0].waitForTimeout(250);
      if (actions > 0 && actions % 8 === 0) await expectInSync(pages);
    }
    expect(actions).toBeGreaterThanOrEqual(12);
    await expectInSync(pages);
    // The displayed board matches the authoritative state.
    const room = await readRoom(code);
    const shown = await tokenLabels(pages[0]);
    const home = Object.values(room.ludo.game.tokens as Record<string, number[]>).flat().filter((p) => p === 56).length;
    expect(shown.filter((l) => l.endsWith(", home"))).toHaveLength(home);
  });
}

test("capturing sends the opponent home, with notices on both screens", async ({ browser }) => {
  const names = ["Alice", "Bob"];
  const { code, pages } = await ludoRoom(browser, names);
  const START: Record<string, number> = { red: 0, yellow: 26 };
  let captured = false;
  for (let attempt = 0; attempt < 6 && !captured; attempt++) {
    const { color } = await currentPage(code, pages, names);
    const other = color === "red" ? "yellow" : "red";
    // Mover: one token two squares out, the rest home. Victims: on the next
    // four squares, so a roll of 1–4 captures (5 or 6 can't move this token).
    await seedLudo(code, (ludo) => {
      ludo.game.tokens[color] = [2, 56, 56, 56];
      ludo.game.tokens[other] = [3, 4, 5, 6].map((d) => (START[color] + d - START[other] + 52) % 52);
      ludo.game.turn = { ...ludo.game.turn, phase: "roll", dice: null, legal: [] };
    });
    const { page } = await currentPage(code, pages, names);
    const roll = page.getByRole("button", { name: "Roll the dice" });
    await expect(roll).toBeEnabled();
    await roll.click({ force: true });
    captured = await expect
      .poll(async () => (await readRoom(code)).ludo.game.events.some((e: { captures?: unknown[] }) => e.captures?.length), { timeout: 8_000 })
      .toBe(true)
      .then(() => true, () => false);
  }
  expect(captured).toBe(true);
  await expect.poll(() => anyNotice(pages), { intervals: [100] }).toContain("captured");
  await expectInSync(pages);
});

test("reloading the page resumes the game from the server state", async ({ browser }) => {
  const { pages } = await ludoRoom(browser, ["Alice", "Bob"]);
  for (let i = 0; i < 6; i++) if (!(await playOne(pages))) await pages[0].waitForTimeout(400);
  await expectInSync(pages);
  const before = await tokenLabels(pages[1]);
  await pages[1].reload();
  await expect(pages[1].locator(".ludo-board")).toBeVisible();
  await expect.poll(() => tokenLabels(pages[1])).toEqual(before);
});

test("the turn timer skips a player who doesn't act", async ({ browser }) => {
  test.slow();
  const { code, pages } = await ludoRoom(browser, ["Alice", "Bob"]);
  const before = (await readRoom(code)).ludo.game.turn.color;
  await expect(pages[0].locator(".ludo-timer")).toBeVisible();
  await expect
    .poll(async () => (await readRoom(code)).ludo.game.events.some((e: { type: string }) => e.type === "skip"), { timeout: 60_000, intervals: [1000] })
    .toBe(true);
  expect((await readRoom(code)).ludo.game.turn.color).not.toBe(before);
  await expect.poll(() => anyNotice(pages), { intervals: [100] }).toContain("ran out of time");
});

test("winning, playing again, and forfeiting by leaving", async ({ browser }) => {
  const names = ["Alice", "Bob"];
  const { code, pages } = await ludoRoom(browser, names);
  // One token one square from home: a 1 wins (keep trying until someone rolls it).
  await expect
    .poll(
      async () => {
        const room = await readRoom(code);
        if (room.status === "finished") return true;
        const { page, color } = await currentPage(code, pages, names);
        await seedLudo(code, (ludo) => (ludo.game.tokens[color] = [55, 56, 56, 56]));
        const roll = page.getByRole("button", { name: "Roll the dice" });
        if (await roll.isEnabled().catch(() => false)) await roll.click({ force: true });
        await page.waitForTimeout(2500);
        return (await readRoom(code)).status === "finished";
      },
      { timeout: 110_000, intervals: [200] }
    )
    .toBe(true);
  for (const page of pages) await expect(page.getByText("Winner", { exact: true })).toBeVisible();

  const room = await readRoom(code);
  const host = pages[names.indexOf(room.playerNames[room.hostId])];
  const guest = pages.find((p) => p !== host)!;
  await host.getByRole("button", { name: "Play Again" }).click();
  for (const page of pages) await expect(page.locator(".ludo-lobby")).toBeVisible();

  await guest.getByRole("button", { name: "I'm ready" }).click();
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(guest.locator(".ludo-board")).toBeVisible();
  await guest.getByRole("button", { name: "Leave" }).click();
  await guest.getByRole("button", { name: "Forfeit?" }).click();
  await expect(guest.getByPlaceholder("Your name")).toBeVisible();
  await expect(host.getByText("Winner", { exact: true })).toBeVisible();
  expect((await readRoom(code)).players).toHaveLength(1);
});

test("join errors: unknown room, full room, game already started", async ({ browser }) => {
  const stranger = await newPlayer(browser, "Zed");
  await stranger.getByPlaceholder("Room code").fill("0001");
  await stranger.getByRole("button", { name: "Join" }).click();
  await expect(stranger.getByText("Room not found")).toBeVisible();

  const { code } = await ludoRoom(browser, ["Alice", "Bob"], { start: false });
  await stranger.getByPlaceholder("Room code").fill(code);
  await stranger.getByRole("button", { name: "Join" }).click();
  await expect(stranger.getByText("This room is full.")).toBeVisible();

  const started = await ludoRoom(browser, ["Cy", "Di"]);
  await stranger.getByPlaceholder("Room code").fill(started.code);
  await stranger.getByRole("button", { name: "Join" }).click();
  await expect(stranger.getByText("This game has already started.")).toBeVisible();
});

test("phones: board fits without sideways scrolling and controls are easy to tap", async ({ browser }) => {
  const names = ["Ann", "Ben", "Cat", "Dan"];
  const { pages } = await ludoRoom(browser, names, { viewports: [SMALL_PHONE, PHONE, { width: 768, height: 1024 }, { width: 1280, height: 800 }] });
  for (const page of pages) {
    const { width } = page.viewportSize()!;
    const box = await page.locator(".ludo-frame").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const roll = await page.getByRole("button", { name: "Roll the dice" }).boundingBox();
    expect(roll!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(pages[3].locator(".ludo-game.is-wide .ludo-panel")).toBeVisible();
  // Play until someone has a token choice, then check the pick buttons' size.
  for (let i = 0; i < 40; i++) {
    const pick = pages.map((p) => p.locator(".ludo-pick").first());
    for (const p of pick) {
      if (await p.isVisible().catch(() => false)) {
        const box = (await p.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(40);
        return;
      }
    }
    if (!(await playOne(pages))) await pages[0].waitForTimeout(300);
  }
});

test("chat works in a Ludo room", async ({ browser }) => {
  const { pages } = await ludoRoom(browser, ["Alice", "Bob"]);
  const [alice, bob] = pages;
  await bob.locator("button:has(svg path[d^='M20 2H4'])").click();
  const strip = bob.locator(".mobile-chat");
  await bob.locator(".chat-inputrow textarea").fill("good luck!");
  const before = await strip.boundingBox();
  await bob.locator(".chat-send").click();
  await alice.locator("button:has(svg path[d^='M20 2H4'])").click();
  await expect(alice.locator(".msg-text", { hasText: "good luck!" })).toBeVisible();
  // Keyboard open (smaller viewport): the chat strip keeps its size
  await bob.setViewportSize({ width: PHONE.width, height: 480 });
  await bob.waitForTimeout(500);
  expect((await strip.boundingBox())!.height).toBe(before!.height);
});
