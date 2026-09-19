import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  crewCertificationsTable,
  crewDaysTable,
  crewsTable,
  db,
  evidenceAuditEventsTable,
  evidenceItemsTable,
  productionAuditEventsTable,
  productionItemsTable,
  productionPlansTable,
  projectsTable,
  sitesTable,
  subcontractorsTable,
  workTypesTable,
} from "@workspace/db";
import {
  GetFieldContextParams,
  GetFieldContextResponse,
  GetProgressSummaryParams,
  GetProgressSummaryResponse,
  ListConfirmedFactsParams,
  ListConfirmedFactsResponse,
  ListFieldHistoryParams,
  ListFieldHistoryResponse,
  ListProposalsParams,
  ListProposalsResponse,
  ReviewProductionItemBody,
  ReviewProductionItemParams,
  ReviewProductionItemResponse,
  SubmitCaptureBody,
  SubmitCaptureParams,
  SubmitCaptureResponse,
} from "@workspace/api-zod";
import { ensureProjectOperationalFoundation } from "../lib/operational-foundation";

const router: IRouter = Router();
const FINAL_STATUSES = ["confirmed", "refused"] as const;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbExecutor = Database | Transaction;

const normalizeQuantity = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = value.toFixed(2);
  return Math.abs(Number(normalized) - value) < 0.0000001 ? normalized : null;
};

const toCents = (value: string | number) => Math.round(Number(value) * 100);

const isRealCalendarDate = (value: string) => {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isStrictDateTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match;
  if (!isRealCalendarDate(`${year}-${month}-${day}`)) return false;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  return !Number.isNaN(Date.parse(value));
};

const hashCapturePayload = (input: {
  projectId: number;
  siteId: number;
  crewId: number;
  workDate: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  items: Array<{ externalId: string; workTypeId: number; quantity: string; unit: string; note: string }>;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        ...input,
        items: [...input.items].sort((a, b) => a.externalId.localeCompare(b.externalId)),
      }),
    )
    .digest("hex");

const withSerializableRetry = async <T>(operation: (tx: Transaction) => Promise<T>): Promise<T> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.transaction(operation, { isolationLevel: "serializable" });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "40001" || attempt === 1) throw error;
    }
  }
  throw new Error("Serializable transaction retry exhausted");
};

const serializeProject = (project: typeof projectsTable.$inferSelect) => ({
  ...project,
  createdAt: project.createdAt.toISOString(),
});

const loadProductionItems = async (executor: DbExecutor, itemIds: number[]) => {
  if (itemIds.length === 0) return [];

  const rows = await executor
    .select({
      item: productionItemsTable,
      crewDay: crewDaysTable,
    })
    .from(productionItemsTable)
    .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
    .where(inArray(productionItemsTable.id, itemIds))
    .orderBy(asc(productionItemsTable.id));

  const auditEvents = await executor
    .select()
    .from(productionAuditEventsTable)
    .where(inArray(productionAuditEventsTable.productionItemId, itemIds))
    .orderBy(asc(productionAuditEventsTable.createdAt), asc(productionAuditEventsTable.id));

  return rows.map(({ item, crewDay }) => ({
    ...item,
    projectId: crewDay.projectId,
    siteId: crewDay.siteId,
    crewId: crewDay.crewId,
    workDate: crewDay.workDate,
    latitude: crewDay.latitude,
    longitude: crewDay.longitude,
    confirmedAt: item.confirmedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    auditEvents: auditEvents
      .filter((event) => event.productionItemId === item.id)
      .map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
  }));
};

router.get("/projects/:projectId/field-context", async (req, res): Promise<void> => {
  const params = GetFieldContextParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  await db.transaction((tx) => ensureProjectOperationalFoundation(tx, project));

  const [sites, subcontractors, crews, certifications, workTypes, plans] = await Promise.all([
    db.select().from(sitesTable).where(eq(sitesTable.projectId, project.id)).orderBy(asc(sitesTable.id)),
    db.select().from(subcontractorsTable).orderBy(asc(subcontractorsTable.id)),
    db.select().from(crewsTable).orderBy(asc(crewsTable.id)),
    db.select().from(crewCertificationsTable),
    db.select().from(workTypesTable).orderBy(asc(workTypesTable.stageNumber)),
    db
      .select()
      .from(productionPlansTable)
      .where(eq(productionPlansTable.projectId, project.id))
      .orderBy(asc(productionPlansTable.id)),
  ]);

  res.json(
    GetFieldContextResponse.parse({
      project: serializeProject(project),
      sites,
      subcontractors,
      crews: crews.map((crew) => ({
        ...crew,
        certifiedWorkTypeIds: certifications
          .filter((certification) => certification.crewId === crew.id)
          .map((certification) => certification.workTypeId),
      })),
      workTypes,
      plans,
    }),
  );
});

router.post("/projects/:projectId/captures", async (req, res): Promise<void> => {
  if (typeof req.body?.workDate !== "string" || !isRealCalendarDate(req.body.workDate)) {
    res.status(400).json({ error: "workDate must be a real calendar date using YYYY-MM-DD" });
    return;
  }
  if (!isStrictDateTime(req.body?.capturedAt)) {
    res.status(400).json({ error: "capturedAt must be an RFC 3339 date-time with a timezone" });
    return;
  }
  const params = SubmitCaptureParams.safeParse(req.params);
  const body = SubmitCaptureBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid capture", details: body.success ? undefined : body.error.message });
    return;
  }
  const normalizedItems = body.data.items.map((item) => ({
    ...item,
    quantity: normalizeQuantity(item.quantity),
    note: item.note ?? "",
  }));
  if (normalizedItems.some((item) => item.quantity === null)) {
    res.status(422).json({ error: "Quantities must be positive and have no more than two decimal places" });
    return;
  }
  const requestedWorkDate = body.data.workDate.toISOString().slice(0, 10);
  const payloadHash = hashCapturePayload({
    projectId: params.data.projectId,
    siteId: body.data.siteId,
    crewId: body.data.crewId,
    workDate: requestedWorkDate,
    capturedAt: new Date(body.data.capturedAt).toISOString(),
    latitude: body.data.latitude,
    longitude: body.data.longitude,
    items: normalizedItems.map((item) => ({
      externalId: item.externalId,
      workTypeId: item.workTypeId,
      quantity: item.quantity!,
      unit: item.unit,
      note: item.note,
    })),
  });

  try {
    const result = await withSerializableRetry(async (tx) => {
      const [existingCrewDay] = await tx
        .select()
        .from(crewDaysTable)
        .where(eq(crewDaysTable.externalId, body.data.externalId));

      if (existingCrewDay) {
        if (existingCrewDay.projectId !== params.data.projectId) {
          return { kind: "conflict" as const };
        }
        const existingItems = await tx
          .select()
          .from(productionItemsTable)
          .where(eq(productionItemsTable.crewDayId, existingCrewDay.id));
        if (existingCrewDay.payloadHash !== payloadHash) {
          return { kind: "conflict" as const };
        }
        return {
          kind: "ok" as const,
          status: 200,
          payload: {
            crewDayId: existingCrewDay.id,
            idempotentReplay: true,
            items: await loadProductionItems(tx, existingItems.map((item) => item.id)),
          },
        };
      }

      const [project] = await tx
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.id, params.data.projectId));
      const [site] = await tx.select().from(sitesTable).where(eq(sitesTable.id, body.data.siteId));
      const [crew] = await tx.select().from(crewsTable).where(eq(crewsTable.id, body.data.crewId));
      if (!project || !site || site.projectId !== project.id || !crew) {
        return { kind: "validation" as const, error: "Project, site, or crew does not exist in this context" };
      }

      const workTypeIds = [...new Set(body.data.items.map((item) => item.workTypeId))];
      const workTypes = await tx
        .select()
        .from(workTypesTable)
        .where(inArray(workTypesTable.id, workTypeIds));
      const certifications = await tx
        .select()
        .from(crewCertificationsTable)
        .where(
          and(
            eq(crewCertificationsTable.crewId, crew.id),
            inArray(crewCertificationsTable.workTypeId, workTypeIds),
          ),
        );
      const plans = await tx
        .select()
        .from(productionPlansTable)
        .where(
          and(
            eq(productionPlansTable.projectId, project.id),
            eq(productionPlansTable.siteId, site.id),
            inArray(productionPlansTable.workTypeId, workTypeIds),
          ),
        );

      for (const workTypeId of workTypeIds) {
        const workType = workTypes.find((candidate) => candidate.id === workTypeId);
        const plan = plans.find((candidate) => candidate.workTypeId === workTypeId);
        if (!workType || !plan) {
          return { kind: "validation" as const, error: "Every item must match a planned work type for this site" };
        }
        if (!certifications.some((certification) => certification.workTypeId === workTypeId)) {
          return { kind: "validation" as const, error: `Crew is not certified for ${workType.name}` };
        }
        const inputs = normalizedItems.filter((item) => item.workTypeId === workTypeId);
        if (inputs.some((input) => input.unit !== workType.unit)) {
          return { kind: "validation" as const, error: `${workType.name} must be recorded in ${workType.unit}` };
        }
        const captureCents = inputs.reduce((total, input) => total + toCents(input.quantity!), 0);
        const [crewDayRecorded] = await tx
          .select({ quantity: sql<string>`coalesce(sum(${productionItemsTable.quantity}), 0)` })
          .from(productionItemsTable)
          .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
          .where(
            and(
              eq(crewDaysTable.crewId, crew.id),
              eq(crewDaysTable.workDate, requestedWorkDate),
              eq(productionItemsTable.workTypeId, workTypeId),
              ne(productionItemsTable.status, "refused"),
            ),
          );
        if (toCents(crewDayRecorded.quantity) + captureCents > toCents(workType.maxPerCrewDay)) {
          return {
            kind: "validation" as const,
            error: `${workType.name} exceeds the ${workType.maxPerCrewDay} ${workType.unit} crew-day limit`,
          };
        }

        const [recorded] = await tx
          .select({
            quantity: sql<string>`coalesce(sum(${productionItemsTable.quantity}), 0)`,
          })
          .from(productionItemsTable)
          .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
          .where(
            and(
              eq(crewDaysTable.projectId, project.id),
              eq(crewDaysTable.siteId, site.id),
              eq(productionItemsTable.workTypeId, workTypeId),
              ne(productionItemsTable.status, "refused"),
            ),
          );
        if (toCents(recorded.quantity) + captureCents > toCents(plan.plannedQuantity)) {
          return {
            kind: "validation" as const,
            error: `${workType.name} would exceed the planned quantity of ${plan.plannedQuantity} ${workType.unit}`,
          };
        }
      }

      const [crewDay] = await tx
        .insert(crewDaysTable)
        .values({
          projectId: project.id,
          siteId: site.id,
          crewId: crew.id,
          workDate: body.data.workDate.toISOString().slice(0, 10),
          externalId: body.data.externalId,
          payloadHash,
          capturedAt: new Date(body.data.capturedAt),
          latitude: body.data.latitude?.toFixed(6),
          longitude: body.data.longitude?.toFixed(6),
        })
        .returning();

      const insertedItems = await tx
        .insert(productionItemsTable)
        .values(
          normalizedItems.map((item) => ({
            crewDayId: crewDay.id,
            workTypeId: item.workTypeId,
            externalId: item.externalId,
            quantity: item.quantity!,
            unit: item.unit,
            note: item.note,
            status: "needs_review" as const,
          })),
        )
        .returning();

      await tx.insert(productionAuditEventsTable).values(
        insertedItems.map((item) => ({
          productionItemId: item.id,
          decision: "submitted" as const,
          actor: `crew:${crew.code}`,
          previousStatus: null,
          nextStatus: "needs_review" as const,
          metadata: {
            captureExternalId: body.data.externalId,
            itemExternalId: item.externalId,
          },
        })),
      );

      return {
        kind: "ok" as const,
        status: 201,
        payload: {
          crewDayId: crewDay.id,
          idempotentReplay: false,
          items: await loadProductionItems(tx, insertedItems.map((item) => item.id)),
        },
      };
    });

    if (result.kind === "conflict") {
      res.status(409).json({ error: "Capture externalId already exists with different data" });
      return;
    }
    if (result.kind === "validation") {
      res.status(422).json({ error: result.error });
      return;
    }
    res.status(result.status).json(SubmitCaptureResponse.parse(result.payload));
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") {
      const [existingCrewDay] = await db
        .select()
        .from(crewDaysTable)
        .where(eq(crewDaysTable.externalId, body.data.externalId));
      if (existingCrewDay?.payloadHash === payloadHash) {
        const existingItems = await db
          .select({ id: productionItemsTable.id })
          .from(productionItemsTable)
          .where(eq(productionItemsTable.crewDayId, existingCrewDay.id));
        res.status(200).json(
          SubmitCaptureResponse.parse({
            crewDayId: existingCrewDay.id,
            idempotentReplay: true,
            items: await loadProductionItems(db, existingItems.map((item) => item.id)),
          }),
        );
        return;
      }
    }
    if (code === "23505" || code === "40001") {
      res.status(409).json({
        error:
          code === "40001"
            ? "Capture conflicted with another update; retry with the same externalId"
            : "Capture or item externalId already exists with different data",
      });
      return;
    }
    throw error;
  }
});

router.get("/projects/:projectId/proposals", async (req, res): Promise<void> => {
  const params = ListProposalsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ids = await db
    .select({ id: productionItemsTable.id })
    .from(productionItemsTable)
    .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
    .where(
      and(
        eq(crewDaysTable.projectId, params.data.projectId),
        inArray(productionItemsTable.status, ["captured", "queued", "proposed", "needs_review"]),
      ),
    );
  res.json(ListProposalsResponse.parse(await loadProductionItems(db, ids.map((item) => item.id))));
});

router.get("/projects/:projectId/facts", async (req, res): Promise<void> => {
  const params = ListConfirmedFactsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ids = await db
    .select({ id: productionItemsTable.id })
    .from(productionItemsTable)
    .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
    .where(
      and(
        eq(crewDaysTable.projectId, params.data.projectId),
        eq(productionItemsTable.status, "confirmed"),
      ),
    );
  res.json(ListConfirmedFactsResponse.parse(await loadProductionItems(db, ids.map((item) => item.id))));
});

router.get("/projects/:projectId/field-history", async (req, res): Promise<void> => {
  const params = ListFieldHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ids = await db
    .select({ id: productionItemsTable.id })
    .from(productionItemsTable)
    .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
    .where(eq(crewDaysTable.projectId, params.data.projectId))
    .orderBy(sql`${productionItemsTable.createdAt} desc`)
    .limit(100);
  res.json(ListFieldHistoryResponse.parse(await loadProductionItems(db, ids.map((item) => item.id))));
});

router.patch("/production-items/:productionItemId/review", async (req, res): Promise<void> => {
  const params = ReviewProductionItemParams.safeParse(req.params);
  const body = ReviewProductionItemBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid review decision" });
    return;
  }
  if (body.data.decision === "refuse" && !body.data.reason?.trim()) {
    res.status(422).json({ error: "A refusal reason is required" });
    return;
  }
  if (
    (body.data.decision === "correct" || body.data.decision === "refuse") &&
    (!body.data.reasonCode || !body.data.reason?.trim())
  ) {
    res.status(422).json({
      error: "Corrections and refusals require a reason code and explanation",
    });
    return;
  }
  if (
    body.data.reasonCode &&
    !["duplicate", "wrong_site", "wrong_crew", "wrong_work_type", "implausible_quantity", "unreadable_evidence", "duplicate_capture", "other"].includes(body.data.reasonCode)
  ) {
    res.status(422).json({ error: "Unknown review reason code" });
    return;
  }
  if (body.data.decision === "correct" && body.data.quantity === undefined) {
    res.status(422).json({ error: "A corrected quantity is required" });
    return;
  }
  const correctedQuantity =
    body.data.decision === "correct" ? normalizeQuantity(body.data.quantity!) : undefined;
  if (body.data.decision === "correct" && correctedQuantity === null) {
    res.status(422).json({ error: "Corrected quantity must have no more than two decimal places" });
    return;
  }

  const result = await withSerializableRetry(async (tx) => {
    const [current] = await tx
      .select()
      .from(productionItemsTable)
      .where(eq(productionItemsTable.id, params.data.productionItemId));
    if (!current) return { kind: "missing" as const };
    if (FINAL_STATUSES.includes(current.status as (typeof FINAL_STATUSES)[number])) {
      return { kind: "conflict" as const };
    }

    if (body.data.decision === "correct") {
      const [crewDay] = await tx
        .select()
        .from(crewDaysTable)
        .where(eq(crewDaysTable.id, current.crewDayId));
      const [workType] = await tx
        .select()
        .from(workTypesTable)
        .where(eq(workTypesTable.id, current.workTypeId));
      const [plan] = await tx
        .select()
        .from(productionPlansTable)
        .where(
          and(
            eq(productionPlansTable.projectId, crewDay.projectId),
            eq(productionPlansTable.siteId, crewDay.siteId),
            eq(productionPlansTable.workTypeId, current.workTypeId),
          ),
        );
      if (!plan || body.data.quantity! > Number(workType.maxPerCrewDay)) {
        return { kind: "validation" as const, error: "Corrected quantity exceeds the allowed crew-day limit" };
      }
      const [sameCrewDayTotal] = await tx
        .select({ quantity: sql<string>`coalesce(sum(${productionItemsTable.quantity}), 0)` })
        .from(productionItemsTable)
        .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
        .where(
          and(
            eq(crewDaysTable.crewId, crewDay.crewId),
            eq(crewDaysTable.workDate, crewDay.workDate),
            eq(productionItemsTable.workTypeId, current.workTypeId),
            ne(productionItemsTable.id, current.id),
            ne(productionItemsTable.status, "refused"),
          ),
        );
      if (toCents(sameCrewDayTotal.quantity) + toCents(correctedQuantity!) > toCents(workType.maxPerCrewDay)) {
        return { kind: "validation" as const, error: "Corrected quantity exceeds the aggregate crew-day limit" };
      }
      const [otherRecorded] = await tx
        .select({ quantity: sql<string>`coalesce(sum(${productionItemsTable.quantity}), 0)` })
        .from(productionItemsTable)
        .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
        .where(
          and(
            eq(crewDaysTable.projectId, crewDay.projectId),
            eq(crewDaysTable.siteId, crewDay.siteId),
            eq(productionItemsTable.workTypeId, current.workTypeId),
            ne(productionItemsTable.id, current.id),
            ne(productionItemsTable.status, "refused"),
          ),
        );
      if (toCents(otherRecorded.quantity) + toCents(correctedQuantity!) > toCents(plan.plannedQuantity)) {
        return { kind: "validation" as const, error: "Corrected quantity would exceed the site plan" };
      }
    }

    const nextStatus = body.data.decision === "refuse" ? "refused" : "confirmed";
    const [updated] = await tx
      .update(productionItemsTable)
      .set({
        status: nextStatus,
        quantity: correctedQuantity ?? current.quantity,
        refusalReason: body.data.decision === "refuse" ? body.data.reason!.trim() : null,
        confirmedAt: nextStatus === "confirmed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productionItemsTable.id, current.id),
          inArray(productionItemsTable.status, ["captured", "queued", "proposed", "needs_review"]),
        ),
      )
      .returning();
    if (!updated) return { kind: "conflict" as const };

    await tx.insert(productionAuditEventsTable).values({
      productionItemId: updated.id,
      decision:
        body.data.decision === "confirm"
          ? "confirmed"
          : body.data.decision === "correct"
            ? "corrected"
            : "refused",
      actor: body.data.actor,
      reason: body.data.reason?.trim() || null,
      previousStatus: current.status,
      nextStatus,
      metadata:
        body.data.decision === "correct"
          ? {
              previousQuantity: current.quantity,
              correctedQuantity: updated.quantity,
              reasonCode: body.data.reasonCode ?? null,
              explanation: body.data.reason?.trim() || null,
            }
          : {
              reasonCode: body.data.reasonCode ?? null,
              explanation: body.data.reason?.trim() || null,
            },
    });

    const linkedEvidence = await tx
      .select({ id: evidenceItemsTable.id })
      .from(evidenceItemsTable)
      .where(eq(evidenceItemsTable.productionItemId, updated.id));
    if (linkedEvidence.length > 0) {
      await tx.insert(evidenceAuditEventsTable).values(
        linkedEvidence.map((evidence) => ({
          evidenceId: evidence.id,
          eventType: "production_review_decision",
          actor: body.data.actor,
          details: {
            productionItemId: updated.id,
            decision: body.data.decision,
            reasonCode: body.data.reasonCode ?? null,
            explanation: body.data.reason?.trim() || null,
            previousQuantity: current.quantity,
            decidedQuantity: updated.quantity,
          },
        })),
      );
    }
    return {
      kind: "ok" as const,
      item: (await loadProductionItems(tx, [updated.id]))[0],
    };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Production item not found" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "Production item has already received a final decision" });
    return;
  }
  if (result.kind === "validation") {
    res.status(422).json({ error: result.error });
    return;
  }
  res.json(ReviewProductionItemResponse.parse(result.item));
});

router.get("/projects/:projectId/progress-summary", async (req, res): Promise<void> => {
  const params = GetProgressSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const plannedRows = await db
    .select({
      workTypeId: workTypesTable.id,
      code: workTypesTable.code,
      name: workTypesTable.name,
      stageNumber: workTypesTable.stageNumber,
      unit: workTypesTable.unit,
      plannedQuantity: sql<string>`coalesce(sum(${productionPlansTable.plannedQuantity}), 0)`,
    })
    .from(productionPlansTable)
    .innerJoin(workTypesTable, eq(productionPlansTable.workTypeId, workTypesTable.id))
    .where(eq(productionPlansTable.projectId, params.data.projectId))
    .groupBy(
      workTypesTable.id,
      workTypesTable.code,
      workTypesTable.name,
      workTypesTable.stageNumber,
      workTypesTable.unit,
    )
    .orderBy(asc(workTypesTable.stageNumber));

  const confirmedRows = await db
    .select({
      workTypeId: productionItemsTable.workTypeId,
      confirmedQuantity: sql<string>`coalesce(sum(${productionItemsTable.quantity}), 0)`,
    })
    .from(productionItemsTable)
    .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
    .where(
      and(
        eq(crewDaysTable.projectId, params.data.projectId),
        eq(productionItemsTable.status, "confirmed"),
      ),
    )
    .groupBy(productionItemsTable.workTypeId);

  res.json(
    GetProgressSummaryResponse.parse({
      projectId: params.data.projectId,
      rows: plannedRows.map((row) => {
        const confirmedQuantity =
          confirmedRows.find((confirmed) => confirmed.workTypeId === row.workTypeId)?.confirmedQuantity ?? "0";
        return {
        ...row,
          confirmedQuantity,
          remainingQuantity: Math.max(0, Number(row.plannedQuantity) - Number(confirmedQuantity)).toFixed(2),
        };
      }),
    }),
  );
});

export default router;