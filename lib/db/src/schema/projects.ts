import {
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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

export const productionUnitEnum = pgEnum("production_unit", ["each", "metres"]);
export const productionStatusEnum = pgEnum("production_status", [
  "captured",
  "queued",
  "proposed",
  "needs_review",
  "confirmed",
  "refused",
]);
export const reviewDecisionEnum = pgEnum("review_decision", [
  "submitted",
  "proposed",
  "routed_to_review",
  "confirmed",
  "corrected",
  "refused",
]);

export const projectsTable = pgTable("fiber_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  client: text("client").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  stages: jsonb("stages").$type<StageRecord[]>().notNull(),
});

export const subcontractorsTable = pgTable(
  "fiber_subcontractors",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("fiber_subcontractors_code_unique").on(table.code)],
);

export const sitesTable = pgTable(
  "fiber_sites",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fiber_sites_project_code_unique").on(table.projectId, table.code),
    unique("fiber_sites_id_project_unique").on(table.id, table.projectId),
    index("fiber_sites_project_idx").on(table.projectId),
  ],
);

export const crewsTable = pgTable(
  "fiber_crews",
  {
    id: serial("id").primaryKey(),
    subcontractorId: integer("subcontractor_id")
      .notNull()
      .references(() => subcontractorsTable.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    foremanName: text("foreman_name").notNull().default(""),
    headcount: integer("headcount").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fiber_crews_code_unique").on(table.code),
    index("fiber_crews_subcontractor_idx").on(table.subcontractorId),
  ],
);

export const workTypesTable = pgTable(
  "fiber_work_types",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    stageNumber: integer("stage_number").notNull(),
    unit: productionUnitEnum("unit").notNull(),
    maxPerCrewDay: numeric("max_per_crew_day", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fiber_work_types_code_unique").on(table.code),
    uniqueIndex("fiber_work_types_stage_unique").on(table.stageNumber),
  ],
);

export const crewCertificationsTable = pgTable(
  "fiber_crew_certifications",
  {
    crewId: integer("crew_id")
      .notNull()
      .references(() => crewsTable.id, { onDelete: "cascade" }),
    workTypeId: integer("work_type_id")
      .notNull()
      .references(() => workTypesTable.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("fiber_crew_certification_unique").on(table.crewId, table.workTypeId)],
);

export const productionPlansTable = pgTable(
  "fiber_production_plans",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    siteId: integer("site_id").notNull(),
    workTypeId: integer("work_type_id")
      .notNull()
      .references(() => workTypesTable.id),
    plannedQuantity: numeric("planned_quantity", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fiber_production_plans_unique").on(table.projectId, table.siteId, table.workTypeId),
    index("fiber_production_plans_project_idx").on(table.projectId),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [sitesTable.id, sitesTable.projectId],
      name: "fiber_production_plans_site_project_fk",
    }).onDelete("cascade"),
  ],
);

export const crewDaysTable = pgTable(
  "fiber_crew_days",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    siteId: integer("site_id").notNull(),
    crewId: integer("crew_id")
      .notNull()
      .references(() => crewsTable.id),
    workDate: date("work_date", { mode: "string" }).notNull(),
    externalId: text("external_id").notNull(),
    payloadHash: text("payload_hash").notNull().default(""),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fiber_crew_days_external_id_unique").on(table.externalId),
    index("fiber_crew_days_project_date_idx").on(table.projectId, table.workDate),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [sitesTable.id, sitesTable.projectId],
      name: "fiber_crew_days_site_project_fk",
    }),
  ],
);

export const productionItemsTable = pgTable(
  "fiber_production_items",
  {
    id: serial("id").primaryKey(),
    crewDayId: integer("crew_day_id")
      .notNull()
      .references(() => crewDaysTable.id, { onDelete: "cascade" }),
    workTypeId: integer("work_type_id")
      .notNull()
      .references(() => workTypesTable.id),
    externalId: text("external_id").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
    unit: productionUnitEnum("unit").notNull(),
    status: productionStatusEnum("status").notNull().default("captured"),
    note: text("note").notNull().default(""),
    refusalReason: text("refusal_reason"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fiber_production_items_external_id_unique").on(table.externalId),
    index("fiber_production_items_crew_day_idx").on(table.crewDayId),
    index("fiber_production_items_status_idx").on(table.status),
  ],
);

export const productionAuditEventsTable = pgTable(
  "fiber_production_audit_events",
  {
    id: serial("id").primaryKey(),
    productionItemId: integer("production_item_id")
      .notNull()
      .references(() => productionItemsTable.id),
    decision: reviewDecisionEnum("decision").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason"),
    previousStatus: productionStatusEnum("previous_status"),
    nextStatus: productionStatusEnum("next_status").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("fiber_production_audit_item_idx").on(table.productionItemId, table.createdAt)],
);