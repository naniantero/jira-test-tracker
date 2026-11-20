import { expect, test } from "@playwright/test";
import { pagePayload } from "./payload";
import { ADMIN, TESTER } from "./users";

test.describe("tester", () => {
  test.use({ storageState: TESTER.storageState });

  test('shows both epics with progress "0/2 tested" and "0/3 tested"', async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Ordering/ })).toContainText("0/2 tested");
    await expect(page.getByRole("button", { name: /Account/ })).toContainText("0/3 tested");
    await expect(page.getByRole("link", { name: /PROJ-21\b/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Account/ }).click();
    await expect(page.getByRole("link", { name: /PROJ-21\b/ })).toBeVisible();
  });

  test("Untested tab shows count 35", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "All (35)" })).toBeVisible();
    const untested = page.getByRole("tab", { name: "Untested (35)" });
    await untested.click();
    await expect(page).toHaveURL(/tab=untested/);
    await expect(untested).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: /Ordering/ }).click();
    await expect(page.getByRole("link", { name: /PROJ-11\b/ })).toBeVisible();
  });

  test('Issues tab shows "No stories in this view."', async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Issues (0)" }).click();
    await expect(page.getByText("No stories in this view.")).toBeVisible();
  });

  test("tester has no Changed tab and ?tab=changed falls back to all", async ({ page }) => {
    await page.goto("/?tab=changed");
    await expect(page.getByRole("tab", { name: /Changed/ })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "All (35)" })).toHaveAttribute("aria-selected", "true");
  });

  test("tester page payload carries no admin-only data", async ({ page }) => {
    // The RSC payload too, so props passed to client components are inspected.
    const html = await pagePayload(page, "/");
    expect(html).toContain("PROJ-11"); // sanity: we are looking at the real page
    expect(html).not.toContain("contentChangedAt");
    expect(html).not.toContain("statusChangedByName");
    expect(html).not.toMatch(/\\?"changed\\?"\s*:/); // the Changed tab count key
    expect(html).not.toContain("Changed since tested");
  });

  test("one epic is open at a time and stays open across reloads", async ({ page }) => {
    await page.goto("/");
    const ordering = page.getByRole("link", { name: /PROJ-11\b/ });
    const account = page.getByRole("link", { name: /PROJ-21\b/ });
    await page.getByRole("button", { name: /Ordering/ }).click();
    await expect(ordering).toBeVisible();
    await page.getByRole("button", { name: /Account/ }).click();
    await expect(account).toBeVisible();
    await expect(ordering).toBeHidden();
    await page.reload();
    await expect(account).toBeVisible();
    await expect(ordering).toBeHidden();
  });

  test("an epic with 30 stories pages them 25 at a time", async ({ page }) => {
    const storyLink = (key: string) => page.getByRole("link", { name: new RegExp(`${key}\\b`) });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Checkout flow/ })).toContainText("0/30 tested");
    const pages = page.getByRole("navigation", { name: "Checkout flow pages" });
    await page.getByRole("button", { name: /Checkout flow/ }).click();
    await expect(storyLink("PROJ-301")).toContainText("Checkout step 01");
    await expect(storyLink("PROJ-325")).toBeVisible();
    await expect(storyLink("PROJ-326")).toHaveCount(0);

    await pages.getByRole("button", { name: "Go to page 2" }).click();
    await expect(storyLink("PROJ-326")).toContainText("Checkout step 26");
    await expect(storyLink("PROJ-330")).toBeVisible();
    await expect(storyLink("PROJ-301")).toHaveCount(0);
    await expect(pages.getByRole("button", { name: "Go to next page" })).toBeDisabled();

    // Three stories: no pagination for Account.
    await page.getByRole("button", { name: /Account/ }).click();
    await expect(storyLink("PROJ-22")).toContainText("Reset password");
    await expect(page.getByRole("navigation", { name: "Account pages" })).toHaveCount(0);
  });

  test("clicking a story sets ?story=PROJ-11", async ({ page }) => {
    await page.goto("/?tab=untested");
    await page.getByRole("button", { name: /Ordering/ }).click();
    await page.getByRole("link", { name: /PROJ-11\b/ }).click();
    await expect(page).toHaveURL(/story=PROJ-11/);
    await expect(page).toHaveURL(/tab=untested/);
  });
});

test.describe("admin", () => {
  test.use({ storageState: ADMIN.storageState });

  test("admin sees the Changed tab", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "Changed (0)" })).toBeVisible();
  });
});
