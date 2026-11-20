import { expect, test } from "@playwright/test";
import { ADMIN, TESTER } from "./users";

async function addUser(page: import("@playwright/test").Page, u: { username: string; name: string; password: string }) {
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Username").fill(u.username);
  await dialog.getByLabel("Name", { exact: true }).fill(u.name);
  await dialog.getByLabel("Password").fill(u.password);
  await dialog.getByRole("button", { name: "Create user" }).click();
  return dialog;
}

test.describe("admin", () => {
  test.use({ storageState: ADMIN.storageState });

  test('admin creates tester "maija" and she can sign in', async ({ page, browser }) => {
    await page.goto("/admin/users");
    const dialog = await addUser(page, { username: "maija", name: "Maija Meikäläinen", password: "maija-password-1" });
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row", { name: /maija/ });
    await expect(row).toContainText("Maija Meikäläinen");
    await expect(row).toContainText("Tester");

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const fresh = await ctx.newPage();
    await fresh.goto("/login");
    await fresh.getByLabel("Username").fill("maija");
    await fresh.getByLabel("Password").fill("maija-password-1");
    await fresh.getByRole("button", { name: "Sign in" }).click();
    await fresh.waitForURL("/");
    await expect(fresh.getByRole("banner")).toContainText("Maija Meikäläinen");
    await ctx.close();
  });

  test("own row has no delete", async ({ page }) => {
    await page.goto("/admin/users");
    const own = page.getByRole("row", { name: new RegExp(ADMIN.username) });
    await own.getByRole("button", { name: /Actions for/ }).click();
    await expect(page.getByRole("menuitem", { name: "Set password" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  });

  test("password shorter than 10 is rejected", async ({ page }) => {
    await page.goto("/admin/users");
    const dialog = await addUser(page, { username: "shorty", name: "Shorty", password: "short" });
    await expect(dialog.getByRole("alert")).toContainText("at least 10 characters");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("row", { name: /shorty/ })).toHaveCount(0);
  });

  test("duplicate username shows an inline error", async ({ page }) => {
    await page.goto("/admin/users");
    const dialog = await addUser(page, { username: TESTER.username, name: "Dup", password: "long-enough-pass" });
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("admin can set a password and delete a user", async ({ page }) => {
    await page.goto("/admin/users");
    const dialog = await addUser(page, { username: "temp", name: "Temp User", password: "temp-password-1" });
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row", { name: /temp/ });
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Set password" }).click();
    const pw = page.getByRole("dialog");
    await pw.getByLabel("New password").fill("short");
    await pw.getByRole("button", { name: "Set password" }).click();
    await expect(pw.getByRole("alert")).toContainText("at least 10 characters");
    await pw.getByLabel("New password").fill("another-password-1");
    await pw.getByRole("button", { name: "Set password" }).click();
    await expect(pw).toBeHidden();

    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Delete temp? Their test history stays.");
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("row", { name: /temp/ })).toHaveCount(0);
  });
});

test.describe("tester", () => {
  test.use({ storageState: TESTER.storageState });

  test("tester gets 404 on /admin/users", async ({ page }) => {
    const res = await page.goto("/admin/users");
    expect(res?.status()).toBe(404);
  });
});
