import { expect, test, type Page } from "@playwright/test";
import { ADMIN, TESTER } from "./users";

/*
 * The admin page for groups and test cases. Earlier specs left PROJ-11, PROJ-12 and PROJ-21 Passed (3/35 tested).
 * This spec adds the group PROJ-4 with one case, PROJ-41, and leaves no case flagged as changed. The steps build on
 * each other.
 */
test.describe.configure({ mode: "serial" });

const groupToggle = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${title}\\b`) });
const caseRow = (page: Page, key: string) => page.getByRole("row", { name: new RegExp(`\\b${key}\\b`) });
const storyLink = (page: Page, key: string) => page.getByRole("link", { name: new RegExp(`${key}\\b`) });

async function openGroup(page: Page, title: string) {
  const trigger = groupToggle(page, title);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

async function caseAction(page: Page, key: string, item: string) {
  await page.getByRole("button", { name: `Actions for ${key}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("admin", () => {
  test.use({ storageState: ADMIN.storageState });

  test("creates a group and a test case, which show in the tree", async ({ page }) => {
    await page.goto("/admin/cases");
    await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

    await page.getByRole("button", { name: "New group" }).click();
    const groupDialog = page.getByRole("dialog", { name: "New group" });
    await groupDialog.getByLabel("Key").fill("PROJ-4");
    await groupDialog.getByLabel("Title").fill("Wishlist");
    await groupDialog.getByRole("button", { name: "Create" }).click();
    await expect(groupDialog).toBeHidden();
    await expect(groupToggle(page, "Wishlist")).toContainText("0 test cases");

    await openGroup(page, "Wishlist");
    await expect(page.getByText("No test cases in this group.")).toBeVisible();
    await groupToggle(page, "Wishlist").locator("..").getByRole("button", { name: "New test case" }).click();
    const caseDialog = page.getByRole("dialog", { name: "New test case" });
    await expect(caseDialog).toContainText("Adds a test case to Wishlist.");
    await caseDialog.getByLabel("Key").fill("PROJ-41");
    await caseDialog.getByLabel("Title").fill("Save to wishlist");
    await caseDialog.getByLabel("Description").fill("A product can be saved to the wishlist.");
    await caseDialog.getByLabel("Acceptance criteria").fill("The heart icon saves the product\n\nSaved products stay");
    await caseDialog.getByRole("button", { name: "Create" }).click();
    await expect(caseDialog).toBeHidden();
    await expect(caseRow(page, "PROJ-41")).toContainText("Save to wishlist");
    await expect(groupToggle(page, "Wishlist")).toContainText("1 test case");

    await page.goto("/");
    await expect(page.getByRole("banner")).toContainText("3/36 tested");
    await expect(page.getByRole("button", { name: /Wishlist/ })).toContainText("0/1 tested");
    await page.getByRole("button", { name: /Wishlist/ }).click();
    await storyLink(page, "PROJ-41").click();
    const sheet = page.getByRole("dialog", { name: "Save to wishlist" });
    await expect(sheet.getByRole("region", { name: "Description" })).toContainText(
      "A product can be saved to the wishlist.",
    );
    // The blank line is dropped.
    await expect(sheet.getByRole("region", { name: "Acceptance criteria" }).getByRole("listitem")).toHaveText([
      /The heart icon saves the product$/,
      /Saved products stay$/,
    ]);
  });

  test("a duplicate group key is refused", async ({ page }) => {
    await page.goto("/admin/cases");
    await page.getByRole("button", { name: "New group" }).click();
    const dialog = page.getByRole("dialog", { name: "New group" });
    await dialog.getByLabel("Key").fill("PROJ-4");
    await dialog.getByLabel("Title").fill("Another wishlist");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("A group with this key already exists.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(groupToggle(page, "Another wishlist")).toHaveCount(0);
  });

  test("editing a passed case's criteria flags it on the Changed tab", async ({ page }) => {
    await page.goto("/admin/cases");
    await openGroup(page, "Ordering");
    await caseAction(page, "PROJ-12", "Edit");
    const dialog = page.getByRole("dialog", { name: "Edit test case" });
    const criteria = dialog.getByLabel("Acceptance criteria");
    await expect(criteria).toHaveValue("Visa and Mastercard are accepted\nA declined card shows a clear message");
    await criteria.fill(
      "Visa and Mastercard are accepted\nA declined card shows a clear message\nAmerican Express is accepted",
    );
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/?tab=changed");
    await expect(page.getByRole("tab", { name: "Changed (1)" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: /Ordering/ }).click();
    await expect(storyLink(page, "PROJ-12")).toContainText("Changed since tested");

    await storyLink(page, "PROJ-12").click();
    const sheet = page.getByRole("dialog", { name: "Pay by card" });
    const alert = sheet.getByRole("alert").filter({ hasText: "Changed since tested" });
    await expect(alert).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Acceptance criteria" })).toContainText(
      "American Express is accepted",
    );
    const activity = sheet.getByRole("region", { name: "Activity" });
    await expect(activity).toContainText("Changed: acceptance criteria.");
    await expect(activity).toContainText(ADMIN.username);

    // Later specs count the Changed tab from zero.
    await alert.getByRole("button", { name: "Keep status" }).click();
    await expect(alert).toBeHidden();
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Changed (0)" })).toBeVisible();
  });

  test("an archived case leaves the tree until it is restored", async ({ page }) => {
    await page.goto("/admin/cases");
    await openGroup(page, "Wishlist");
    await caseAction(page, "PROJ-41", "Archive");
    await expect(page.getByText("Archived PROJ-41.")).toBeVisible();
    await expect(caseRow(page, "PROJ-41")).toHaveCount(0);

    await page.goto("/");
    await expect(page.getByRole("banner")).toContainText("3/35 tested");
    await page.goto("/?story=PROJ-41");
    await expect(page.getByRole("dialog", { name: "Story not found." })).toBeVisible();

    await page.goto("/admin/cases");
    await page.getByRole("checkbox", { name: "Show archived" }).click();
    await expect(page).toHaveURL(/archived=1/);
    await openGroup(page, "Wishlist");
    await expect(caseRow(page, "PROJ-41")).toContainText("Archived");
    await caseAction(page, "PROJ-41", "Restore");
    await expect(page.getByText("Restored PROJ-41.")).toBeVisible();
    await expect(caseRow(page, "PROJ-41")).not.toContainText("Archived");

    await page.goto("/");
    await expect(page.getByRole("banner")).toContainText("3/36 tested");
    await page.getByRole("button", { name: /Wishlist/ }).click();
    await expect(storyLink(page, "PROJ-41")).toContainText("Save to wishlist");
  });

  test("a case of an archived group is not found on its direct link until the group is restored", async ({ page }) => {
    await page.goto("/admin/cases");
    await caseAction(page, "PROJ-4", "Archive");
    await expect(page.getByText("Archived PROJ-4.", { exact: true })).toBeVisible();

    await page.goto("/?story=PROJ-41");
    await expect(page.getByRole("dialog", { name: "Story not found." })).toBeVisible();

    await page.goto("/admin/cases?archived=1");
    await caseAction(page, "PROJ-4", "Restore");
    await expect(page.getByText("Restored PROJ-4.", { exact: true })).toBeVisible();
    await page.goto("/?story=PROJ-41");
    await expect(page.getByRole("dialog", { name: "Save to wishlist" })).toBeVisible();
  });

  test("removed admin routes are gone", async ({ request }) => {
    for (const path of ["/admin/scope", "/admin/import", "/admin/tokens"]) {
      expect((await request.get(path)).status()).toBe(404);
    }
  });
});

test.describe("tester", () => {
  test.use({ storageState: TESTER.storageState });

  test("tester gets 404 on /admin/cases", async ({ page }) => {
    const res = await page.goto("/admin/cases");
    expect(res?.status()).toBe(404);
  });
});
