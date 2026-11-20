import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LOCALE, TIME_ZONE } from "@/i18n/config";
import messages from "@/i18n/messages/en.json";

function Intl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={LOCALE} messages={messages} timeZone={TIME_ZONE}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Testing Library's `render` inside the English messages, as the app's root layout provides them. */
export function renderWithIntl(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: Intl, ...options });
}
