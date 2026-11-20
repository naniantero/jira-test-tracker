// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "../helpers/intl";
import { EpicRow } from "@/components/tree/epic-row";
import { setOpenEpic } from "@/components/tree/open-epic";

afterEach(() => {
  cleanup();
  setOpenEpic(null);
});

const epic = { key: "ABC-1", title: "Epic", progress: { tested: 30, total: 30 } as never };

function renderEpic(count: number, selectedPage?: number | null) {
  return (
    <EpicRow epic={epic} selectedPage={selectedPage}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-testid="story">{`Story ${i + 1}`}</div>
      ))}
    </EpicRow>
  );
}

describe("EpicRow open state", () => {
  const trigger = (name: RegExp) => screen.getByRole("button", { name });

  function renderTwo(selected: "A" | "B" | null = null) {
    return (
      <>
        <EpicRow epic={{ ...epic, key: "A-1", title: "Alpha" }} selectedPage={selected === "A" ? 0 : null}>
          <div>Alpha story</div>
        </EpicRow>
        <EpicRow epic={{ ...epic, key: "B-1", title: "Beta" }} selectedPage={selected === "B" ? 0 : null}>
          <div>Beta story</div>
        </EpicRow>
      </>
    );
  }

  it("starts with every epic closed", () => {
    renderWithIntl(renderTwo());
    expect(trigger(/Alpha/)).toHaveAttribute("aria-expanded", "false");
    expect(trigger(/Beta/)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Alpha story")).toBeNull();
  });

  it("keeps one epic open at a time", () => {
    renderWithIntl(renderTwo());
    fireEvent.click(trigger(/Alpha/));
    expect(screen.getByText("Alpha story")).toBeInTheDocument();
    fireEvent.click(trigger(/Beta/));
    expect(trigger(/Alpha/)).toHaveAttribute("aria-expanded", "false");
    expect(trigger(/Beta/)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger(/Beta/));
    expect(trigger(/Beta/)).toHaveAttribute("aria-expanded", "false");
  });

  it("remembers the open epic in sessionStorage across remounts", () => {
    const { unmount } = renderWithIntl(renderTwo());
    fireEvent.click(trigger(/Beta/));
    expect(sessionStorage.getItem("test-tracker:open-epic")).toBe("B-1");
    unmount();
    renderWithIntl(renderTwo());
    expect(trigger(/Beta/)).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the epic holding the selected story", () => {
    const { rerender } = renderWithIntl(renderTwo("A"));
    expect(trigger(/Alpha/)).toHaveAttribute("aria-expanded", "true");
    rerender(renderTwo("B"));
    expect(trigger(/Alpha/)).toHaveAttribute("aria-expanded", "false");
    expect(trigger(/Beta/)).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the epic open when the selection clears", () => {
    const { rerender } = renderWithIntl(renderTwo("A"));
    rerender(renderTwo(null));
    expect(trigger(/Alpha/)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("EpicRow paging", () => {
  beforeEach(() => {
    act(() => setOpenEpic(epic.key));
  });

  it("shows 25 of 30 and a second page", () => {
    renderWithIntl(renderEpic(30));
    expect(screen.getAllByTestId("story")).toHaveLength(25);
    expect(screen.getByRole("button", { name: "Go to page 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to page 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Go to previous page" })).toBeDisabled();
  });

  it("next shows items 26-30", () => {
    renderWithIntl(renderEpic(30));
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    const items = screen.getAllByTestId("story");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Story 26");
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go to page 2" })).toHaveAttribute("aria-current", "page");
  });

  it("no pagination for 25 or fewer", () => {
    renderWithIntl(renderEpic(25));
    expect(screen.getAllByTestId("story")).toHaveLength(25);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("selectedPage opens the page holding the selected story", () => {
    renderWithIntl(renderEpic(30, 1));
    expect(screen.getAllByTestId("story")).toHaveLength(5);
  });

  it("clamps the page when the children shrink", () => {
    const { rerender } = renderWithIntl(renderEpic(30, 1));
    rerender(renderEpic(10, 1));
    expect(screen.getAllByTestId("story")).toHaveLength(10);
  });

  it("names each pagination nav after its epic", () => {
    renderWithIntl(renderEpic(30));
    expect(screen.getByRole("navigation", { name: "Epic pages" })).toBeInTheDocument();
  });

  it("follows a newly selected page and keeps the page when selection clears", () => {
    const { rerender } = renderWithIntl(renderEpic(30, null));
    expect(screen.getAllByTestId("story")).toHaveLength(25);
    rerender(renderEpic(30, 1));
    expect(screen.getAllByTestId("story")).toHaveLength(5);
    rerender(renderEpic(30, null));
    expect(screen.getAllByTestId("story")).toHaveLength(5);
  });

  it("settles when the selected page is NaN (regression: client reference used as a number)", () => {
    renderWithIntl(renderEpic(30, Number.NaN));
    expect(screen.getAllByTestId("story")).toHaveLength(25);
  });

  it("settles with the props page.tsx passes for an epic without the selected story", () => {
    renderWithIntl(renderEpic(30, null));
    expect(screen.getAllByTestId("story")).toHaveLength(25);
  });

  it("progress text shows the whole epic", () => {
    renderWithIntl(renderEpic(30));
    expect(screen.getByText("30/30 tested")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByText("30/30 tested")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Epic/ })).toHaveAttribute("aria-expanded", "true");
  });
});
