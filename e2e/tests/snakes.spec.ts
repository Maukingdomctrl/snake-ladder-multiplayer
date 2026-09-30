import { expect, test } from "@playwright/test";
import { newPlayer } from "./helpers";

// Snakes & Ladders must keep working exactly as before Ludo was added.
test("Snakes & Ladders: create, join, start, roll and chat", async ({ browser }) => {
  const sam = await newPlayer(browser, "Sam");
  const tia = await newPlayer(browser, "Tia");
  await expect(sam.getByRole("radio", { name: "Snakes & Ladders" })).toHaveAttribute("aria-checked", "true");
  await sam.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(sam.getByText("The Kingdom")).toBeVisible();
  const code = (await sam.locator("p", { hasText: /^\d{4}$/ }).first().textContent())!.trim();

  await tia.getByPlaceholder("Room code").fill(code);
  await tia.getByRole("button", { name: "Join" }).click();
  await expect(tia.getByText("The Kingdom")).toBeVisible();
  await sam.getByRole("button", { name: "Start Game" }).click();
  await expect(sam.getByText("Game Starting")).toBeVisible();
  await expect(sam.getByRole("button", { name: "Roll the dice" })).toBeVisible({ timeout: 15_000 });

  const squares = (page: typeof sam) => page.locator("text=/Sq\\. \\d+/").allTextContents();
  expect(await squares(sam)).toEqual(["Sq. 1", "Sq. 1"]);
  for (const page of [sam, tia]) {
    const roll = page.getByRole("button", { name: "Roll the dice" });
    if (await roll.isEnabled()) {
      await roll.click({ force: true });
      break;
    }
  }
  await expect.poll(async () => (await squares(sam)).some((s) => s.includes("rolled")), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => squares(tia), { timeout: 20_000 }).toEqual(await squares(sam));

  await tia.locator("button:has(svg path[d^='M20 2H4'])").click();
  await tia.locator(".chat-inputrow textarea").fill("snakes chat ok");
  await tia.locator(".chat-send").click();
  await sam.locator("button:has(svg path[d^='M20 2H4'])").click();
  await expect(sam.locator(".msg-text", { hasText: "snakes chat ok" })).toBeVisible();
});
