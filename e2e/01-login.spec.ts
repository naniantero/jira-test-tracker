import { expect, test } from "@playwright/test";
import { ADMIN, TESTER } from "./users";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Scoped to the form: Next's route announcer also has role="alert".
    await expect(page.locator("form").getByRole("alert")).toHaveText("Invalid username or password.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("pages send anti-framing and referrer security headers", async ({ page }) => {
    const res = await page.request.get("/login");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["referrer-policy"]).toBe("same-origin");
  });

  test("unauthenticated visit to / redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("admin", () => {
  test.use({ storageState: ADMIN.storageState });

  test('admin (storage state) sees header "0/35 tested"', async ({ page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header).toContainText("0/35 tested");
    await expect(header.getByRole("img", { name: "0 of 35 tested" })).toBeVisible();
    for (const link of ["Test cases", "Users"]) {
      await expect(header.getByRole("link", { name: link })).toBeVisible();
    }
  });
});

test.describe("tester", () => {
  test.use({ storageState: TESTER.storageState });

  test("tester sees no admin links", async ({ page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header).toContainText("0/35 tested");
    await expect(header.getByRole("button", { name: TESTER.name })).toBeVisible();
    await expect(header.getByRole("link", { name: "Users" })).toHaveCount(0);
  });
});
