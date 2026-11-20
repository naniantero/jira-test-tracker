import { expect, test, type Page } from "@playwright/test";
import { formatDate } from "../src/lib/format";
import { pagePayload } from "./payload";
import { ADMIN, TESTER } from "./users";

// The steps build on each other (PROJ-12 goes Issue → Ready for retest → Passed); later specs expect
// PROJ-11, PROJ-12 and PROJ-21 to end as Passed.
test.describe.configure({ mode: "serial" });

const today = () => formatDate(new Date());

/** The story sheet (a modal dialog named after the story title). */
const sheetFor = (page: Page, title: string) => page.getByRole("dialog", { name: title });

/** A story's row in the tree; its status badge is a menu button. */
const storyRow = (page: Page, key: string) => page.locator(`[data-story-row="${key}"]`);

async function openEpic(page: Page, name: RegExp) {
  const trigger = page.getByRole("button", { name });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

/** Closes the sheet; the tree behind the modal is only exposed to assistive tech again afterwards. */
async function closeSheet(page: Page, title: string) {
  await sheetFor(page, title).getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheetFor(page, title)).toBeHidden();
  await expect(page).not.toHaveURL(/story=/);
}

test.describe("tester", () => {
  test.use({ storageState: TESTER.storageState });

  test("unknown story shows Story not found.", async ({ page }) => {
    await page.goto("/?story=NOPE-1");
    await expect(page.getByRole("dialog", { name: "Story not found." })).toBeVisible();
  });

  test("the sheet opens at once with a skeleton while the story loads", async ({ page }) => {
    await page.goto("/");
    await openEpic(page, /Ordering/);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/story=PROJ-11/, async (route) => {
      await held;
      await route.continue();
    });
    await page.getByRole("link", { name: /PROJ-11\b/ }).click();
    await expect(page.getByRole("dialog", { name: "Loading story…" })).toBeVisible();
    release();
    await expect(sheetFor(page, "Edit cart")).toBeVisible();
    await expect(page).toHaveURL(/story=PROJ-11/);
  });

  test("tester page payload for an open story carries no admin-only data", async ({ page }) => {
    const html = await pagePayload(page, "/?story=PROJ-11");
    expect(html).toContain("Quantity can be increased and decreased"); // sanity: the sheet rendered
    expect(html).not.toContain("contentChangedAt");
    expect(html).not.toContain("Send to retest");
    expect(html).not.toContain("Keep status");
  });

  test("the sheet shows the description and the criteria", async ({ page }) => {
    await page.goto("/?story=PROJ-11");
    const sheet = sheetFor(page, "Edit cart");
    const description = sheet.getByRole("region", { name: "Description" });
    await expect(description).toContainText("As a customer I want to change quantities in my cart");
    await expect(description).not.toContainText("Quantity can be increased");
    const criteria = sheet.getByRole("region", { name: "Acceptance criteria" });
    await expect(criteria.getByRole("listitem")).toHaveText([
      /Quantity can be increased and decreased/,
      /Setting quantity to 0 removes the product/,
      /The total updates immediately/,
    ]);
  });

  test("open PROJ-11, Works marks it Passed in sheet, row and header", async ({ page }) => {
    await page.goto("/?tab=untested");
    await page.getByRole("button", { name: /Ordering/ }).click();
    await page.getByRole("link", { name: /PROJ-11\b/ }).click();
    const sheet = sheetFor(page, "Edit cart");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Reference" })).toHaveAttribute(
      "href",
      "https://example.invalid/browse/PROJ-11",
    );
    await expect(sheet).toContainText("Ordering");
    await expect(sheet.getByRole("heading", { name: "Acceptance criteria" })).toBeVisible();
    await expect(sheet).toContainText("Setting quantity to 0 removes the product");

    await sheet.getByRole("button", { name: "Works" }).click();
    await expect(sheet.getByText(`Passed · ${today()}`)).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Activity" })).toContainText("Tina Tester");

    await closeSheet(page, "Edit cart");
    await expect(page).toHaveURL(/tab=untested/);
    await expect(page.getByRole("banner")).toContainText("1/35 tested");
    await page.goto("/");
    await expect(storyRow(page, "PROJ-11")).toContainText(`Passed · ${today()}`);
  });

  test("pasting a screenshot into the comment adds it as a removable attachment", async ({ page }) => {
    await page.goto("/?story=PROJ-22");
    const sheet = sheetFor(page, "Reset password");
    // A reference that is not an http(s) URL shows as text.
    await expect(sheet.getByText("PROJ-1035")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Reference" })).toHaveCount(0);
    const comment = sheet.getByRole("textbox", { name: "Comment" });
    await comment.focus();
    await comment.evaluate((el) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    const chip = sheet.getByRole("listitem").filter({ hasText: "Pasted image 1.png" });
    await expect(chip).toBeVisible();
    await chip.getByRole("button", { name: "Remove Pasted image 1.png" }).click();
    await expect(chip).toHaveCount(0);
  });

  test("PROJ-12 Report issue… needs a comment, then records it with a screenshot", async ({ page }) => {
    await page.goto("/?story=PROJ-12");
    const sheet = sheetFor(page, "Pay by card");
    await sheet.getByRole("button", { name: "Report issue…" }).click();
    await expect(sheet.getByRole("heading", { name: "Report issue" })).toBeVisible();

    const submit = sheet.getByRole("button", { name: "Report issue", exact: true });
    await submit.click();
    await expect(sheet.getByText("A comment is required for this change.")).toBeVisible();

    await sheet.getByRole("textbox", { name: "Comment" }).fill("Card form crashes");
    await sheet.getByLabel("Attach files").setInputFiles("e2e/fixtures/screenshot.png");
    await expect(sheet.getByRole("listitem").filter({ hasText: "screenshot.png" })).toBeVisible();
    await submit.click();

    await expect(sheet.getByText(`Issue · ${today()}`)).toBeVisible();
    const activity = sheet.getByRole("region", { name: "Activity" });
    await expect(activity).toContainText("Card form crashes");
    const thumb = activity.getByRole("button", { name: "Open screenshot.png" });
    await expect(thumb).toBeVisible();
    await expect.poll(() => thumb.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160);
    // Global security headers sit alongside the attachment route's own.
    const file = await page.request.get((await thumb.locator("img").getAttribute("src"))!);
    expect(file.headers()).toMatchObject({
      "x-frame-options": "DENY",
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "content-type": "image/png",
    });

    await thumb.click();
    const preview = page.getByRole("dialog", { name: "screenshot.png" });
    await expect(preview.getByRole("img", { name: "screenshot.png" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();

    await closeSheet(page, "Pay by card");
    await expect(storyRow(page, "PROJ-12")).toContainText(`Issue · ${today()}`);
  });

  test("tester has no Mark as fixed button on PROJ-12", async ({ page }) => {
    await page.goto("/?story=PROJ-12");
    const sheet = sheetFor(page, "Pay by card");
    await expect(sheet.getByRole("button", { name: "Works" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Mark as fixed" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "More" })).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: ADMIN.storageState });

  test("admin marks PROJ-12 as fixed", async ({ page }) => {
    await page.goto("/?story=PROJ-12");
    const sheet = sheetFor(page, "Pay by card");
    // Overrides sit in the More menu.
    await sheet.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Reset to untested" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Reset to untested" })).toBeHidden();

    await sheet.getByRole("button", { name: "Mark as fixed" }).click();
    await expect(sheet.getByText(`Ready for retest · ${today()}`)).toBeVisible();

    await closeSheet(page, "Pay by card");
    await expect(page.getByRole("tab", { name: "Retest (1)" })).toBeVisible();
  });
});

test.describe("tester after the fix", () => {
  test.use({ storageState: TESTER.storageState });

  test("PROJ-12 Works completes the Ordering epic", async ({ page }) => {
    await page.goto("/?story=PROJ-12");
    const sheet = sheetFor(page, "Pay by card");
    await sheet.getByRole("button", { name: "Works" }).click();
    await expect(page.getByText("Epic complete: Ordering 🎉")).toBeVisible();
    await expect(sheet.getByText(`Passed · ${today()}`)).toBeVisible();
  });

  test("stale sheet is rejected", async ({ page, context }) => {
    const pageB = await context.newPage();
    await page.goto("/?story=PROJ-21");
    await pageB.goto("/?story=PROJ-21");

    await sheetFor(page, "Sign up").getByRole("button", { name: "Works" }).click();
    await expect(sheetFor(page, "Sign up").getByText(`Passed · ${today()}`)).toBeVisible();

    const sheetB = sheetFor(pageB, "Sign up");
    await sheetB.getByRole("button", { name: "Report issue…" }).click();
    await sheetB.getByRole("textbox", { name: "Comment" }).fill("Sign up button does nothing");
    await sheetB.getByRole("button", { name: "Report issue", exact: true }).click();
    await expect(pageB.getByText("This story was updated by someone else. Reload to see the latest.")).toBeVisible();
    // The sheet catches up by itself and the typed report survives for a retry.
    await expect(sheetB.getByText(`Passed · ${today()}`)).toBeVisible();
    await expect(sheetB.getByRole("textbox", { name: "Comment" })).toHaveValue("Sign up button does nothing");
    await pageB.close();
  });

  test("the row's status menu changes PROJ-22 without opening the sheet", async ({ page }) => {
    await page.goto("/");
    await openEpic(page, /Account/);
    const row = storyRow(page, "PROJ-22");
    await row.getByRole("button", { name: "Change status of PROJ-22: Untested" }).click();
    await page.getByRole("menuitem", { name: "Works" }).click();
    await expect(row).toContainText(`Passed · ${today()}`);
    await expect(page).not.toHaveURL(/story=/);

    await row.getByRole("button", { name: /Change status of PROJ-22/ }).click();
    await page.getByRole("menuitem", { name: "Report issue…" }).click();
    const dialog = page.getByRole("dialog", { name: "Report issue" });
    await expect(dialog).toContainText("PROJ-22 · Reset password");
    const submit = dialog.getByRole("button", { name: "Report issue", exact: true });
    await submit.click();
    await expect(dialog.getByText("A comment is required for this change.")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Comment" }).fill("Reset link expires at once");
    await submit.click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(`Issue · ${today()}`);
    await expect(page).not.toHaveURL(/story=/);
  });
});

test.describe("admin after the row menu", () => {
  test.use({ storageState: ADMIN.storageState });

  test("admin resets PROJ-22 to untested from the row, with a comment", async ({ page }) => {
    await page.goto("/");
    await openEpic(page, /Account/);
    const row = storyRow(page, "PROJ-22");
    await row.getByRole("button", { name: "Change status of PROJ-22: Issue" }).click();
    await page.getByRole("menuitem", { name: "Reset to untested" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset to untested" });
    await dialog.getByRole("textbox", { name: "Comment" }).fill("Back to the queue");
    await dialog.getByRole("button", { name: "Reset to untested", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Untested");
  });
});
