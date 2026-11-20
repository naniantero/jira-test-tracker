export type ContentField = "title" | "description" | "acceptance criteria";
export type CaseContent = { title: string; description: string; criteria: string[] };

/** The content fields that differ, in the order they appear in the event text. */
export function changedFields(before: CaseContent, after: CaseContent): ContentField[] {
  const fields: ContentField[] = [];
  if (before.title.trim() !== after.title.trim()) fields.push("title");
  if (before.description !== after.description) fields.push("description");
  if (before.criteria.length !== after.criteria.length || before.criteria.some((c, i) => c !== after.criteria[i])) {
    fields.push("acceptance criteria");
  }
  return fields;
}

export function contentChangeEvent(fields: ContentField[]): string {
  return `Changed: ${fields.join(", ")}.`;
}
