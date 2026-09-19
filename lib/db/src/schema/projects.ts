import { date, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export type StageRecord = {
  number: number;
  name: string;
  phase: string;
  description: string;
  status: "not_started" | "in_progress" | "blocked" | "complete";
  owner: string;
  completedAt: string | null;
  note: string;
  evidenceName: string;
};

export const projectsTable = pgTable("fiber_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  client: text("client").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  stages: jsonb("stages").$type<StageRecord[]>().notNull(),
});