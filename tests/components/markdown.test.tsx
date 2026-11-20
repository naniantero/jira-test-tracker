// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Markdown } from "@/components/story/markdown";

// No vitest globals, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

describe("Markdown", () => {
  it("Markdown does not render raw HTML or javascript: links", () => {
    const { container } = render(
      <Markdown source={"<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))"} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("renders gfm list and link with target _blank", () => {
    const { container } = render(
      <Markdown
        source={"- one\n- [ ] two\n\nSee https://example.com/docs and [the spec](https://wiki.example.com)."}
      />,
    );
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    // GFM: task list item and bare-URL autolink.
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com/docs", "https://wiki.example.com"]);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
