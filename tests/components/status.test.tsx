// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "../helpers/intl";
import { StatusBadge } from "@/components/status/status-badge";
import { StatusProgress } from "@/components/status/status-progress";

// No vitest globals, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

describe("StatusBadge", () => {
  it("renders label and date for passed", () => {
    const { container } = renderWithIntl(<StatusBadge status="passed" date={new Date("2026-11-16T23:30:00Z")} />);
    expect(container).toHaveTextContent("Passed · 17 Nov 2026");
  });

  it("renders untested without a date separator", () => {
    const { container } = renderWithIntl(<StatusBadge status="untested" />);
    expect(container).toHaveTextContent("Untested");
    expect(container.textContent).not.toContain("·");
  });

  it("uses the UI labels from the global constraints", () => {
    expect(renderWithIntl(<StatusBadge status="failed" />).container).toHaveTextContent("Issue");
    expect(renderWithIntl(<StatusBadge status="retest" />).container).toHaveTextContent("Ready for retest");
  });
});

describe("StatusProgress", () => {
  it("describes tested over total", () => {
    renderWithIntl(<StatusProgress counts={{ total: 5, untested: 2, passed: 1, failed: 1, retest: 1, tested: 3 }} />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "3 of 5 tested");
  });

  it("renders an empty bar when there is nothing to test", () => {
    renderWithIntl(<StatusProgress counts={{ total: 0, untested: 0, passed: 0, failed: 0, retest: 0, tested: 0 }} />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "0 of 0 tested");
  });
});
