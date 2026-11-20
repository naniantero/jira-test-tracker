/** Acceptance criteria as stored in `stories.criteria`: a JSON array of strings. */
export function encodeCriteria(list: string[]): string {
  return JSON.stringify(list);
}

/** The stored criteria; anything that is not a JSON array of strings reads as none. */
export function decodeCriteria(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
  } catch {
    return [];
  }
}
