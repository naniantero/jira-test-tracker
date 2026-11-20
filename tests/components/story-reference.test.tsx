// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "../helpers/intl";
import { StoryReference } from "@/components/story/story-reference";

afterEach(cleanup);

describe("StoryReference", () => {
  it.each(["https://example.com/spec#login", "http://example.com/a"])("links the http(s) URL %s", (reference) => {
    renderWithIntl(<StoryReference reference={reference} />);
    const link = screen.getByRole("link", { name: "Reference" });
    expect(link).toHaveAttribute("href", reference);
    expect(link).toHaveAttribute("title", reference);
  });

  it.each(["javascript:alert(1)", "PROJ-1035"])("shows %s as text, without a link", (reference) => {
    const { container } = renderWithIntl(<StoryReference reference={reference} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container).toHaveTextContent(reference);
    expect(container.querySelector("a")).toBeNull();
  });
});
