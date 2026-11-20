import { expect, test as setup } from "@playwright/test";
import { ADMIN, TESTER } from "./users";

// One form login per user for the whole suite (login rate limit: 5/min/IP).
for (const user of [ADMIN, TESTER]) {
  setup(`sign in as ${user.username}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(user.username);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("banner")).toContainText("Test Tracker");
    await page.context().storageState({ path: user.storageState });
  });
}
