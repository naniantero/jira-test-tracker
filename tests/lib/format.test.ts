import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";

describe("format", () => {
  it("formatDate uses Helsinki time (rolls over to the next day)", () => {
    expect(formatDate(new Date("2026-11-16T23:30:00Z"))).toBe("17 Nov 2026");
  });

  it("formatDateTime adds a 24h time in Helsinki", () => {
    expect(formatDateTime(new Date("2026-11-16T23:30:00Z"))).toBe("17 Nov 2026, 01:30");
  });

  it("formatBytes uses B, KB and MB with one decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(2.25 * 1024 * 1024)).toBe("2.3 MB");
  });
});
