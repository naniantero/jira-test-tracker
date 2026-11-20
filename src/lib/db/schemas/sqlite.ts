import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { STATUSES } from "../../stories/status";
import { user } from "./auth-sqlite";

export * from "./auth-sqlite";

export { STATUSES };

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  ts("created_at")
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date());

export const epics = sqliteTable("epics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  position: integer("position").notNull(),
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const stories = sqliteTable("stories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  epicId: integer("epic_id")
    .notNull()
    .references(() => epics.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** JSON array of strings (`encodeCriteria` / `decodeCriteria`). */
  criteria: text("criteria").notNull().default("[]"),
  reference: text("reference"),
  contentVersion: integer("content_version").notNull().default(1),
  position: integer("position").notNull(),
  status: text("status", { enum: STATUSES }).notNull().default("untested"),
  statusChangedAt: ts("status_changed_at"),
  statusChangedByName: text("status_changed_by_name"),
  contentChangedAt: ts("content_changed_at"),
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const storyEvents = sqliteTable(
  "story_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storyId: integer("story_id")
      .notNull()
      .references(() => stories.id),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    fromStatus: text("from_status", { enum: STATUSES }),
    toStatus: text("to_status", { enum: STATUSES }),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [index("story_events_story_id_idx").on(t.storyId)],
);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => storyEvents.id),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageName: text("storage_name").notNull().unique(),
  /** Upload order within the event. */
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});
