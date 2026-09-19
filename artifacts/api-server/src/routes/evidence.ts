import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import {
  crewDaysTable,
  db,
  evidenceAuditEventsTable,
  evidenceItemsTable,
  productionItemsTable,
  productionPlansTable,
  sitesTable,
  workTypesTable,
} from "@workspace/db";
import {
  CompleteEvidenceUploadBody,
  CompleteEvidenceUploadParams,
  GetEvidenceParams,
  ListEvidenceParams,
  RequestEvidenceUploadUrlBody,
  RequestEvidenceUploadUrlParams,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  appendEvidenceAudit,
  buildEvidenceChecks,
  interpretEvidence,
  loadEvidence,
  serializeEvidence,
  verifyEvidenceObject,
} from "../lib/evidence";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const retentionDate = (capturedAt: Date) => {
  const retention = new Date(capturedAt);
  retention.setUTCFullYear(retention.getUTCFullYear() + 7);
  return retention.toISOString().slice(0, 10);
};

router.post("/projects/:projectId/evidence/uploads/request-url", async (req, res): Promise<void> => {
  const params = RequestEvidenceUploadUrlParams.safeParse(req.params);
  const body = RequestEvidenceUploadUrlBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? body.error?.message ?? "Invalid request body" : params.error.message });
    return;
  }
  const [project] = await db.select({ id: crewDaysTable.projectId }).from(crewDaysTable).where(
    and(eq(crewDaysTable.projectId, params.data.projectId), eq(crewDaysTable.externalId, body.data.captureExternalId)),
  );
  if (!project) {
    res.status(422).json({ error: "Capture external identifier does not belong to this project" });
    return;
  }
  const [crewDay] = await db
    .select()
    .from(crewDaysTable)
    .where(and(eq(crewDaysTable.projectId, params.data.projectId), eq(crewDaysTable.externalId, body.data.captureExternalId)));
  if (!crewDay) {
    res.status(422).json({ error: "Capture has not been synchronized yet" });
    return;
  }
  const [existing] = await db.select().from(evidenceItemsTable).where(eq(evidenceItemsTable.externalId, body.data.externalId));
  if (existing && existing.projectId !== params.data.projectId) {
    res.status(409).json({ error: "Evidence external identifier belongs to another project" });
    return;
  }
  if (existing) {
    const intentMatches =
      existing.crewDayId === crewDay.id &&
      existing.kind === body.data.kind &&
      existing.contentType === body.data.contentType &&
      existing.byteSize === body.data.byteSize &&
      existing.sha256.toLowerCase() === body.data.sha256.toLowerCase() &&
      existing.capturedAt.getTime() === new Date(body.data.capturedAt).getTime();
    if (!intentMatches) {
      res.status(409).json({ error: "Evidence external identifier conflicts with immutable upload intent", existingEvidenceId: existing.id });
      return;
    }
    const uploadRequired = existing.status === "uploaded";
    const uploadURL = uploadRequired
      ? await storage.getObjectEntityUploadURLForPath(existing.objectPath)
      : null;
    res.status(200).json({
      evidenceId: existing.id,
      externalId: existing.externalId,
      uploadRequired,
      uploadURL: uploadRequired ? uploadURL : null,
      objectPath: existing.objectPath,
      status: existing.status,
    });
    return;
  }
  const details = await storage.getObjectEntityUploadDetails();
  const [evidence] = await db
    .insert(evidenceItemsTable)
    .values({
      projectId: params.data.projectId,
      crewDayId: crewDay.id,
      siteId: crewDay.siteId,
      crewId: crewDay.crewId,
      externalId: body.data.externalId,
      kind: body.data.kind,
      objectPath: details.objectPath,
      contentType: body.data.contentType,
      byteSize: body.data.byteSize,
      sha256: body.data.sha256.toLowerCase(),
      originalName: body.data.originalName,
      capturedAt: new Date(body.data.capturedAt),
      retentionUntil: retentionDate(new Date(body.data.capturedAt)),
      latitude: crewDay.latitude,
      longitude: crewDay.longitude,
      uploaderContext: `capture:${body.data.captureExternalId}`,
    })
    .returning();
  await db.insert(evidenceAuditEventsTable).values({
    evidenceId: evidence.id,
    eventType: "upload_requested",
    actor: "system:evidence-intake",
    details: { captureExternalId: body.data.captureExternalId, byteSize: body.data.byteSize },
  });
  res.status(200).json({
    evidenceId: evidence.id,
    externalId: evidence.externalId,
    uploadRequired: true,
    uploadURL: details.uploadURL,
    objectPath: details.objectPath,
    status: evidence.status,
  });
});

router.post("/projects/:projectId/evidence/:evidenceId/complete", async (req, res): Promise<void> => {
  const params = CompleteEvidenceUploadParams.safeParse(req.params);
  const body = CompleteEvidenceUploadBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? body.error?.message ?? "Invalid request body" : params.error.message });
    return;
  }
  const [evidence] = await db
    .select()
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.id, params.data.evidenceId), eq(evidenceItemsTable.projectId, params.data.projectId)));
  if (!evidence) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }
  if (evidence.status === "ready" || evidence.status === "manual_review") {
    res.status(200).json(serializeEvidence(evidence));
    return;
  }
  const actor = body.data.actor || "system:evidence-intake";
  let processingClaimed = false;
  if (evidence.status === "processing") {
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    const recovered = evidence.verifiedAt
      ? await db.transaction(async (tx) => {
          const [result] = await tx
            .update(evidenceItemsTable)
            .set({ updatedAt: new Date() })
            .where(and(eq(evidenceItemsTable.id, evidence.id), eq(evidenceItemsTable.status, "processing"), isNotNull(evidenceItemsTable.verifiedAt), lt(evidenceItemsTable.updatedAt, staleBefore)))
            .returning();
          if (result) {
            await tx.insert(evidenceAuditEventsTable).values({
              evidenceId: evidence.id,
              eventType: "processing_recovered",
              actor,
              details: { staleBefore: staleBefore.toISOString() },
            });
          }
          return result;
        })
      : undefined;
    if (!recovered) {
      res.status(409).json({ error: "Evidence is already being processed", evidenceId: evidence.id });
      return;
    }
    processingClaimed = true;
  }
  if (!processingClaimed && evidence.status !== "uploaded") {
    res.status(409).json({ error: `Evidence cannot be completed from status ${evidence.status}`, evidenceId: evidence.id });
    return;
  }
  const verification = processingClaimed
    ? { valid: true, actualSha256: evidence.sha256 }
    : await verifyEvidenceObject(evidence.objectPath, evidence.byteSize, evidence.contentType, evidence.sha256);
  if (!verification.valid) {
    const [updated] = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(evidenceItemsTable)
        .set({ status: "manual_review", errorMessage: "Uploaded object failed byte, content-type, or SHA-256 verification.", updatedAt: new Date() })
        .where(and(eq(evidenceItemsTable.id, evidence.id), eq(evidenceItemsTable.status, "uploaded")))
        .returning();
      if (result) {
        await tx.insert(evidenceAuditEventsTable).values({
          evidenceId: evidence.id,
          eventType: "verification_failed",
          actor,
          details: { actualSha256: verification.actualSha256 },
        });
      }
      return [result] as const;
    });
    if (!updated) {
      res.status(409).json({ error: "Evidence was claimed by another completion request", evidenceId: evidence.id });
      return;
    }
    res.status(200).json(serializeEvidence(updated));
    return;
  }
  const claimed = processingClaimed ? evidence : await db.transaction(async (tx) => {
    const [result] = await tx
      .update(evidenceItemsTable)
      .set({ status: "processing", verifiedAt: new Date(), updatedAt: new Date(), errorMessage: null })
      .where(and(eq(evidenceItemsTable.id, evidence.id), eq(evidenceItemsTable.status, "uploaded")))
      .returning();
    if (result) {
      await tx.insert(evidenceAuditEventsTable).values({ evidenceId: evidence.id, eventType: "processing_started", actor, details: {} });
    }
    return result;
  });
  if (!claimed) {
    res.status(409).json({ error: "Evidence was claimed by another completion request", evidenceId: evidence.id });
    return;
  }
  const [crewDay] = await db.select().from(crewDaysTable).where(eq(crewDaysTable.id, evidence.crewDayId));
  const items = await db.select().from(productionItemsTable).where(eq(productionItemsTable.crewDayId, evidence.crewDayId));
  const knownWorkTypeIds = [...new Set(items.map((item) => item.workTypeId))];
  const workTypes =
    knownWorkTypeIds.length > 0
      ? await db
          .select()
          .from(workTypesTable)
          .where(inArray(workTypesTable.id, knownWorkTypeIds))
          .orderBy(asc(workTypesTable.id))
      : [];
  const verifiedDuplicates = await db
    .select({ id: evidenceItemsTable.id })
    .from(evidenceItemsTable)
    .where(
      and(
        eq(evidenceItemsTable.projectId, evidence.projectId),
        eq(evidenceItemsTable.sha256, evidence.sha256),
        isNotNull(evidenceItemsTable.verifiedAt),
        ne(evidenceItemsTable.id, evidence.id),
      ),
    );
  const verifiedDuplicateIds = verifiedDuplicates.map((duplicate) => duplicate.id);
  try {
    const interpretation = await interpretEvidence(evidence, workTypes, items);
    const [plan] = interpretation.workTypeId
      ? await db.select().from(productionPlansTable).where(
          and(eq(productionPlansTable.projectId, evidence.projectId), eq(productionPlansTable.siteId, evidence.siteId), eq(productionPlansTable.workTypeId, interpretation.workTypeId)),
        )
      : [];
    const matchingItems = interpretation.workTypeId ? items.filter((item) => item.workTypeId === interpretation.workTypeId) : [];
    const matchedItem = matchingItems.length === 1 ? matchingItems[0] : undefined;
    const [otherCrewDayTotal] = matchedItem
      ? await db
          .select({ quantity: sql<string>`coalesce(sum(${productionItemsTable.quantity}), 0)` })
          .from(productionItemsTable)
          .where(
            and(
              eq(productionItemsTable.crewDayId, evidence.crewDayId),
              eq(productionItemsTable.workTypeId, matchedItem.workTypeId),
              ne(productionItemsTable.id, matchedItem.id),
              ne(productionItemsTable.status, "refused"),
            ),
          )
      : [{ quantity: "0" }];
    const [otherSiteTotal] = matchedItem
      ? await db
          .select({ quantity: sql<string>`coalesce(sum(${productionItemsTable.quantity}), 0)` })
          .from(productionItemsTable)
          .innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
          .where(
            and(
              eq(crewDaysTable.projectId, evidence.projectId),
              eq(crewDaysTable.siteId, evidence.siteId),
              eq(productionItemsTable.workTypeId, matchedItem.workTypeId),
              ne(productionItemsTable.id, matchedItem.id),
              ne(productionItemsTable.status, "refused"),
            ),
          )
      : [{ quantity: "0" }];
    const checks = buildEvidenceChecks(
      interpretation,
      workTypes,
      items,
      plan?.plannedQuantity,
      otherCrewDayTotal.quantity,
      otherSiteTotal.quantity,
      verifiedDuplicateIds,
    );
    const blockingFailure = checks.some((check) => !check.passed && check.severity === "blocking");
    const productionItemId = matchedItem?.id ?? null;
    const [updated] = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(evidenceItemsTable)
        .set({
          status: blockingFailure || interpretation.confidence < 0.85 || interpretation.identityConfidence < 0.9 ? "manual_review" : "ready",
          productionItemId,
          candidateQuantity: interpretation.quantity?.toFixed(2),
          candidateWorkTypeId: interpretation.workTypeId,
          candidateUnit: interpretation.unit,
          confidence: interpretation.confidence.toFixed(4),
          identityConfidence: interpretation.identityConfidence.toFixed(4),
          explanation: interpretation.explanation,
          transcript: interpretation.transcript,
          checks,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(evidenceItemsTable.id, evidence.id), eq(evidenceItemsTable.status, "processing")))
        .returning();
      if (result) {
        await tx.insert(evidenceAuditEventsTable).values({
          evidenceId: evidence.id,
          eventType: result.status === "manual_review" ? "routed_to_manual_review" : "interpretation_ready",
          actor,
          details: { productionItemId, blockingFailure, verifiedDuplicateIds, workDate: crewDay?.workDate },
        });
      }
      return [result] as const;
    });
    if (!updated) {
      res.status(409).json({ error: "Evidence processing state changed concurrently", evidenceId: evidence.id });
      return;
    }
    res.status(200).json(serializeEvidence(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evidence interpretation failed";
    const [updated] = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(evidenceItemsTable)
        .set({ status: "manual_review", errorMessage: message, checks: [], updatedAt: new Date() })
        .where(and(eq(evidenceItemsTable.id, evidence.id), eq(evidenceItemsTable.status, "processing")))
        .returning();
      if (result) {
        await tx.insert(evidenceAuditEventsTable).values({ evidenceId: evidence.id, eventType: "interpretation_failed", actor, details: { message } });
      }
      return [result] as const;
    });
    if (!updated) {
      res.status(409).json({ error: "Evidence processing state changed concurrently", evidenceId: evidence.id });
      return;
    }
    res.status(200).json(serializeEvidence(updated));
  }
});

router.get("/projects/:projectId/evidence", async (req, res): Promise<void> => {
  const params = ListEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db.select({ id: evidenceItemsTable.id }).from(evidenceItemsTable).where(eq(evidenceItemsTable.projectId, params.data.projectId)).orderBy(asc(evidenceItemsTable.createdAt));
  res.json(await loadEvidence(db, rows.map((row) => row.id)));
});

router.get("/projects/:projectId/evidence/:evidenceId", async (req, res): Promise<void> => {
  const params = GetEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(evidenceItemsTable).where(and(eq(evidenceItemsTable.id, params.data.evidenceId), eq(evidenceItemsTable.projectId, params.data.projectId)));
  if (!row) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }
  res.json((await loadEvidence(db, [row.id]))[0]);
});

router.get("/projects/:projectId/evidence/:evidenceId/content", async (req, res): Promise<void> => {
  const evidenceId = Number(req.params.evidenceId);
  const projectId = Number(req.params.projectId);
  if (!Number.isInteger(evidenceId) || !Number.isInteger(projectId)) {
    res.status(400).json({ error: "Invalid evidence identifier" });
    return;
  }
  const [row] = await db.select().from(evidenceItemsTable).where(and(eq(evidenceItemsTable.id, evidenceId), eq(evidenceItemsTable.projectId, projectId)));
  if (!row) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(row.objectPath);
    const response = await storage.downloadObject(file, 900);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const body = response.body;
    if (!body) {
      res.status(404).json({ error: "Evidence object is empty" });
      return;
    }
    const reader = body.getReader();
    res.status(200);
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      res.write(Buffer.from(chunk.value));
    }
    res.end();
  } catch {
    res.status(404).json({ error: "Evidence object not found" });
  }
});

export default router;