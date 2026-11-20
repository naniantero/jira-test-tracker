import { describe, expect, it } from "vitest";
import { changedFields, contentChangeEvent, type CaseContent } from "@/lib/cases/content-change";

const base: CaseContent = { title: "A", description: "D", criteria: ["x", "y"] };

describe("changedFields", () => {
  it("compares the title trimmed", () => {
    expect(changedFields(base, { ...base, title: " A " })).toEqual([]);
  });

  it("lists every changed field in a fixed order", () => {
    expect(changedFields(base, { title: "B", description: "E", criteria: ["x"] })).toEqual([
      "title",
      "description",
      "acceptance criteria",
    ]);
  });

  it("sees a reordered or edited criteria list as a change", () => {
    expect(changedFields(base, { ...base, criteria: ["y", "x"] })).toEqual(["acceptance criteria"]);
    expect(changedFields(base, { ...base, criteria: ["x", "y"] })).toEqual([]);
  });
});

describe("contentChangeEvent", () => {
  it("names the fields", () => {
    expect(contentChangeEvent(["title", "acceptance criteria"])).toBe("Changed: title, acceptance criteria.");
  });
});
