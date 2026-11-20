import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Server actions translate their errors; outside Next there is no request config, so read the English messages.
// The imports sit in the factory because vi.mock is hoisted above the module's own imports.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/i18n/messages/en.json");
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});
