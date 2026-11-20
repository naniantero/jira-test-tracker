import type messages from "./messages/en.json";
import type { LOCALE } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: typeof LOCALE;
    Messages: typeof messages;
  }
}
