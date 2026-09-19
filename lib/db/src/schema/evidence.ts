import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { crewDaysTable, productionItemsTable, projectsTable, sitesTable, crewsTable, workTypesTable } from "./projects";

export const evidenceKindEnum = pgEnum("fiber_evidence_kind", ["photo", "audio"]);
export const evidenceStatusEnum = pgEnum("fiber_evidence_status", [
  "uploaded",
  "processing",
  "ready",
  "manual_review",
  "failed",
]);

export type EvidenceCheck = {
  code: string;
  passed: boolean;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export const evidenceItemsTable = pgTable(
  "fiber_evidence_items",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    crewDayId: integer("crew_day_id")
      .notNull()
      .references(() => crewDaysTable.id, { onDelete: "cascade" }),
    productionItemId: integer("production_item_id").references(() => productionItemsTable.id, {
      onDelete: "set null",
    }),
    siteId: integer("site_id")
      .notNull()
      .references(() => sitesTable.id),
    crewId: integer("crew_id")
      .notNull()
      .references(() => crewsTable.id),
    externalId: text("external_id").notNull(),
    kind: evidenceKindEnum("kind").notNull(),
    objectPath: text("object_path").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    source: text("source").notNull().default("field_capture"),
    originalName: text("original_name"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    uploaderContext: text("uploader_context").notNull(),
    retentionPolicy: text("retention_policy").notNull().default("project_record"),
    retentionUntil: date("retention_until", { mode: "string" }),
    status: evidenceStatusEnum("status").notNull().default("uploaded"),
    candidateQuantity: numeric("candidate_quantity", { precision: 14, scale: 2 }),
    candidateWorkTypeId: integer("candidate_work_type_id").references(() => workTypesTable.id),
    candidateUnit: text("candidate_unit"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    identityConfidence: numeric("identity_confidence", { precision: 5, scale: 4 }),
    explanation: text("explanation"),
    transcript: text("transcript"),
    checks: jsonb("checks").$type<EvidenceCheck[]>().notNull().default([]),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fiber_evidence_external_id_unique").on(table.externalId),
    index("fiber_evidence_project_idx").on(table.projectId, table.createdAt),
    index("fiber_evidence_crew_day_idx").on(table.crewDayId),
    index("fiber_evidence_hash_idx").on(table.projectId, table.sha256),
  ],
);

export const evidenceAuditEventsTable = pgTable(
  "fiber_evidence_audit_events",
  {
    id: serial("id").primaryKey(),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidenceItemsTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actor: text("actor").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("fiber_evidence_audit_idx").on(table.evidenceId, table.createdAt)],
);

export type EvidenceItem = typeof evidenceItemsTable.$inferSelect;