import { expect, test, type Page } from "@playwright/test";
import { PHONE, SMALL_PHONE, ludoRoom, newPlayer } from "./helpers";

// Layout rules from CLAUDE.md, checked in a real browser. Run before pushing
// any UI change: `npx playwright test tests/layout.spec.ts`.
// SHOTS=1 also saves screenshots to e2e/screenshots/ to look at.

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `screenshots/${name}.png` });
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const viewport of [PHONE, SMALL_PHONE]) {
  test(`join screen ${viewport.width}x${viewport.height}: the room card doesn't move when the keyboard opens`, async ({ browser }) => {
    const page = await newPlayer(browser, "Kim", viewport);
    await expect(page.locator(".gaming-home--mobile")).toBeVisible();
    await shot(page, `join-${viewport.width}`);
    const card = await box(page, ".gh-m-card");
    for (const input of ["Your name", "Room code"]) {
      expect((await page.getByPlaceholder(input).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await noSidewaysScroll(page)).toBe(true);
    // Keyboard open: the visible height roughly halves
    await page.getByPlaceholder("Your name").focus();
    await page.setViewportSize({ width: viewport.width, height: Math.round(viewport.height * 0.55) });
    await page.waitForTimeout(400);
    await shot(page, `join-${viewport.width}-keyboard`);
    expect(await box(page, ".gh-m-card")).toEqual(card);
  });
}

test("desktop home: a wide window with a mouse gets the desktop page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".gaming-home--desktop")).toBeVisible();
  await expect(page.getByPlaceholder("Enter your name")).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await shot(page, "home-desktop");
  await context.close();
});

/** On a phone in a running game, with the chat open and the keyboard up. */
async function checkPhoneRoom(page: Page, name: string) {
  const { width, height } = page.viewportSize()!;
  // The board is the hero: nearly the full width, players in the header
  await expect(page.locator(".channel-header .header-game")).toBeVisible();
  const board = await box(page, ".board-stage");
  expect(board.width).toBeGreaterThanOrEqual(width * 0.9);
  // The die floats on the board and is a big enough tap target
  const die = await box(page, ".dice-float");
  expect(die.x).toBeGreaterThanOrEqual(board.x - 1);
  expect(die.x + die.width).toBeLessThanOrEqual(board.x + board.width + 1);
  expect(die.y + die.height).toBeLessThanOrEqual(board.y + board.height + 1);
  expect(die.height).toBeGreaterThanOrEqual(44);
  await shot(page, `${name}-game`);

  await page.locator("button:has(svg path[d^='M20 2H4'])").click();
  const strip = page.locator(".mobile-chat");
  await expect.poll(() => strip.evaluate((el) => el.getAnimations().length)).toBe(0);
  await page.locator(".chat-inputrow textarea").click();
  const header = await box(page, ".channel-header");
  const input = await box(page, ".mobile-chat");
  await shot(page, `${name}-chat`);

  // Keyboard covering half the screen: only the board reacts
  await page.setViewportSize({ width, height: Math.round(height * 0.5) });
  await expect.poll(async () => (await box(page, ".mobile-chat")).y + input.height, { timeout: 3000 }).toBeLessThanOrEqual(Math.round(height * 0.5) + 1);
  await page.waitForTimeout(400);
  await shot(page, `${name}-keyboard`);
  expect(await box(page, ".channel-header")).toEqual(header);
  expect((await box(page, ".mobile-chat")).height).toBe(input.height);
  const small = await box(page, ".board-stage");
  const chatTop = (await box(page, ".mobile-chat")).y;
  expect(small.y + small.height).toBeLessThanOrEqual(chatTop + 1);
  // The floating messages never take the board's room: it fills what's left
  expect(small.height).toBeGreaterThanOrEqual((chatTop - (header.y + header.height)) * 0.85);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
  expect(await noSidewaysScroll(page)).toBe(true);
}

test("phone room (Snakes & Ladders): board first, steady header, chat floats", async ({ browser }) => {
  const sam = await newPlayer(browser, "Sam");
  const tia = await newPlayer(browser, "Tia");
  await sam.getByRole("button", { name: "Create room", exact: true }).click();
  const code = (await sam.locator("p", { hasText: /^\d{4}$/ }).first().textContent())!.trim();
  await tia.getByPlaceholder("Room code").fill(code);
  await tia.getByRole("button", { name: "Join" }).click();
  await sam.getByRole("button", { name: "Start Game" }).click();
  await expect(sam.getByRole("button", { name: "Roll the dice" })).toBeVisible({ timeout: 15_000 });
  await expect(sam.locator(".channel-header .score-chip")).toHaveCount(2);
  await checkPhoneRoom(sam, "snakes-phone");

  // Rolling while typing keeps the keyboard up
  const roller = (await sam.getByRole("button", { name: "Roll the dice" }).isEnabled()) ? sam : null;
  if (roller) {
    const die = await box(roller, ".dice-float");
    await roller.touchscreen.tap(die.x + die.width / 2, die.y + die.height / 2);
    await roller.waitForTimeout(500);
    expect(await roller.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
  }
});

test("phone room (Ludo): board first, steady header, chat floats", async ({ browser }) => {
  const { pages } = await ludoRoom(browser, ["Ann", "Ben"]);
  await expect(pages[0].locator(".channel-header .ludo-player")).toHaveCount(2);
  await checkPhoneRoom(pages[0], "ludo-phone");
});
