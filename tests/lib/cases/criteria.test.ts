import { describe, expect, it } from "vitest";
import { decodeCriteria, encodeCriteria } from "@/lib/cases/criteria";

describe("criteria encoding", () => {
  it("round-trips a list", () => {
    const list = ["Works", 'Quotes " and\nnewlines', "Ääkköset"];
    expect(decodeCriteria(encodeCriteria(list))).toEqual(list);
    expect(encodeCriteria([])).toBe("[]");
  });

  it("decodes invalid JSON or a non-string array as empty", () => {
    expect(decodeCriteria("not json")).toEqual([]);
    expect(decodeCriteria("{}")).toEqual([]);
    expect(decodeCriteria("[1, 2]")).toEqual([]);
    expect(decodeCriteria('"text"')).toEqual([]);
  });
});
