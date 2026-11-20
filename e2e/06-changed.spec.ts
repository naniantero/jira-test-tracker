import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { SyncFile } from "../src/lib/cases";
import { formatDate } from "../src/lib/format";
import { E2E_DB_ENV } from "./env";
import { ADMIN, TESTER } from "./users";

/*
 * "Changed since tested": PROJ-23 is tested, then its description changes through `tt sync` (the CLI, writing
 * straight to the e2e database) with an edited copy of its group's fixture. PROJ-23 is touched by no other spec.
 * The steps build on each other.
 */
test.describe.configure({ mode: "serial" });

const STORY = "PROJ-23";
const TITLE = "Change email";
const NEW_DESCRIPTION = "Signed-in users can change their email address after a password check.";

const today = () => formatDate(new Date());
const storyLink = (page: Page) => page.getByRole("link", { name: new RegExp(`${STORY}\\b`) });
const sheetFor = (page: Page) => page.getByRole("dialog", { name: TITLE });

test.describe("tester", () => {
  test.use({ storageState: TESTER.storageState });

  test("marks the story Works", async ({ page }) => {
    await page.goto(`/?story=${STORY}`);
    const sheet = sheetFor(page);
    // The content on screen is the baseline a later change is compared against.
    await expect(sheet.getByRole("region", { name: "Description" })).toContainText(
      "Signed-in users can change their email address.",
    );
    await sheet.getByRole("button", { name: "Works" }).click();
    await expect(sheet.getByText(`Passed · ${today()}`)).toBeVisible();
  });
});

test.describe("CLI", () => {
  test("tt sync changes the description", () => {
    const file = JSON.parse(readFileSync("e2e/fixtures/cases/proj-2.json", "utf8")) as SyncFile;
    file.cases = file.cases.map((c) => (c.key === STORY ? { ...c, description: NEW_DESCRIPTION } : c));
    const dir = mkdtempSync(join(tmpdir(), "tt-e2e-"));
    try {
      const path = join(dir, "proj-2.json");
      writeFileSync(path, JSON.stringify(file));
      const out = execFileSync("npx", ["tsx", "src/cli/main.ts", "sync", "--file", path], {
        env: { ...process.env, ...E2E_DB_ENV },
        encoding: "utf8",
      });
      expect(out).toContain(`Updated: ${STORY} (description)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe("admin", () => {
  test.use({ storageState: ADMIN.storageState });

  test("the story is flagged on the Changed tab", async ({ page }) => {
    await page.goto("/?tab=changed");
    await expect(page.getByRole("tab", { name: "Changed (1)" })).toBeVisible();
    await page.getByRole("button", { name: /Account/ }).click();
    await expect(storyLink(page)).toContainText("Changed since tested");

    await storyLink(page).click();
    const sheet = sheetFor(page);
    await expect(sheet.getByRole("alert").filter({ hasText: "Changed since tested" })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Description" })).toContainText("after a password check");
    const activity = sheet.getByRole("region", { name: "Activity" });
    await expect(activity).toContainText("Changed: description.");
    await expect(activity).toContainText("CLI");
  });

  test("Send to retest clears the flag", async ({ page }) => {
    await page.goto(`/?story=${STORY}`);
    const sheet = sheetFor(page);
    await sheet.getByRole("button", { name: "Send to retest" }).click();
    await expect(sheet.getByText(`Ready for retest · ${today()}`)).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "Changed (0)" })).toBeVisible();
  });
});
