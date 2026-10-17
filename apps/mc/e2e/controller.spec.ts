import { type Browser, type Page, expect, test } from "@playwright/test";

test("unauthenticated visitor to / is redirected to signin", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe("/signin?return_to=%2F");
});

async function openController(page: Page): Promise<string> {
  await page.goto("/dev/login?as=e2e&return_to=/");
  await expect(page.getByRole("tab", { name: "A" })).toBeVisible();
  await page.getByRole("button", { name: "診断" }).click();
  const url = page.getByTestId("player-url");
  await expect(url).toHaveValue(/\/play\?t=[0-9a-f]{64}$/);
  const playerUrl = await url.inputValue();
  await page.keyboard.press("Escape");
  return playerUrl;
}

async function openPlayer(browser: Browser, playerUrl: string): Promise<Page> {
  // A separate context = a separate machine (no shared cookies).
  const context = await browser.newContext();
  const player = await context.newPage();
  await player.goto(playerUrl);
  return player;
}

test("play is acknowledged by the player, and stopping asks first", async ({ page, browser }) => {
  const playerUrl = await openController(page);
  const player = await openPlayer(browser, playerUrl);
  await expect(page.getByTestId("player-lamp")).toHaveAttribute("data-state", "ok");

  const card = page.locator(".mc-card").nth(2);
  await card.getByRole("button", { name: "再生", exact: true }).click();
  await expect(card).toHaveAttribute("data-status", "playing");
  await expect(card.getByRole("button", { name: "再生済み" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const bar = page.locator(".mc-bar");
  await expect(bar).toBeVisible();

  // ⏸ is a confirmation, and cancelling keeps the sound going.
  await bar.getByRole("button", { name: "停止" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("再生を停止しますか？")).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(card).toHaveAttribute("data-status", "playing");

  await bar.getByRole("button", { name: "停止" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "停止する" }).click();
  await expect(card).toHaveAttribute("data-status", "paused");

  // Resuming produces sound, so it needs no confirmation.
  await bar.getByRole("button", { name: "再生", exact: true }).click();
  await expect(card).toHaveAttribute("data-status", "playing");
  await bar.getByRole("button", { name: "停止" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "停止する" }).click();
  await expect(card).toHaveAttribute("data-status", "paused");

  await player.context().close();
});

test("a lost player is flagged within seconds and recovers on its own", async ({
  page,
  browser,
}) => {
  const playerUrl = await openController(page);
  const player = await openPlayer(browser, playerUrl);
  await expect(page.getByTestId("player-lamp")).toHaveAttribute("data-state", "ok");

  await player.context().setOffline(true);
  await expect(page.getByTestId("issue")).toHaveText("配信PCが接続されていません", {
    timeout: 6000,
  });

  await player.context().setOffline(false);
  await expect(page.getByTestId("player-lamp")).toHaveAttribute("data-state", "ok", {
    timeout: 8000,
  });
  await expect(page.getByTestId("issue")).toHaveCount(0);
  await player.context().close();
});

test("a command with no player fails immediately and visibly", async ({ page }) => {
  await openController(page);
  await expect(page.getByTestId("player-lamp")).toHaveAttribute("data-state", "down", {
    timeout: 6000,
  });
  await page.locator(".mc-card").first().getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.getByText("配信PCが接続されていません").first()).toBeVisible();
});

test("a player with a wrong token never counts as connected", async ({ page, browser }) => {
  const playerUrl = await openController(page);
  const player = await openPlayer(
    browser,
    playerUrl.replace(/t=[0-9a-f]+$/, `t=${"0".repeat(64)}`),
  );
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("player-lamp")).toHaveAttribute("data-state", "down");
  await player.context().close();
});
