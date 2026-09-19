import { Router } from "express";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db, projectsTable, productionPlansTable, productionItemsTable, productionAuditEventsTable,
  crewDaysTable, sitesTable, crewsTable, workTypesTable, evidenceItemsTable, evidenceAuditEventsTable,
} from "@workspace/db";

const router = Router();
const statuses = ["captured", "queued", "proposed", "needs_review", "refused", "confirmed"] as const;
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

async function projectData(projectId: number) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return null;
  const [plans, workTypes, items, days, sites, crews, evidence] = await Promise.all([
    db.select().from(productionPlansTable).where(eq(productionPlansTable.projectId, projectId)),
    db.select().from(workTypesTable).orderBy(asc(workTypesTable.stageNumber)),
    db.select({ item: productionItemsTable, day: crewDaysTable })
      .from(productionItemsTable).innerJoin(crewDaysTable, eq(productionItemsTable.crewDayId, crewDaysTable.id))
      .where(eq(crewDaysTable.projectId, projectId)),
    db.select().from(crewDaysTable).where(eq(crewDaysTable.projectId, projectId)),
    db.select().from(sitesTable).where(eq(sitesTable.projectId, projectId)),
    db.select().from(crewsTable),
    db.select().from(evidenceItemsTable).where(eq(evidenceItemsTable.projectId, projectId)),
  ]);
  const workTypeRows = workTypes.map((type) => {
    const planned = plans.filter((plan) => plan.workTypeId === type.id).reduce((n, p) => n + Number(p.plannedQuantity), 0);
    const confirmed = items.filter(({ item }) => item.workTypeId === type.id && item.status === "confirmed")
      .reduce((n, { item }) => n + Number(item.quantity), 0);
    const quantities = Object.fromEntries(statuses.map((status) => [
      status === "needs_review" ? "needsReview" : status,
      items.filter(({ item }) => item.workTypeId === type.id && item.status === status)
        .reduce((n, { item }) => n + Number(item.quantity), 0).toFixed(2),
    ]));
    return { workTypeId: type.id, code: type.code, name: type.name, stageNumber: type.stageNumber, unit: type.unit,
      planned: planned.toFixed(2), confirmed: confirmed.toFixed(2), remaining: Math.max(0, planned - confirmed).toFixed(2),
      ratio: planned ? Number((confirmed / planned).toFixed(4)) : null,
      statusQuantities: { ...quantities, waitingTotal: ["captured", "queued", "proposed", "needsReview"]
        .reduce((n, status) => n + Number(quantities[status]), 0).toFixed(2) } };
  });
  const counts = Object.fromEntries(statuses.map((status) => [status, items.filter(({ item }) => item.status === status).length]));
  const lastCapture = days.reduce<Date | null>((last, day) => !last || day.capturedAt > last ? day.capturedAt : last, null);
  const confirmedDates = items.filter(({ item }) => item.status === "confirmed" && item.confirmedAt).map(({ item }) => item.confirmedAt!);
  const lagSamples = items.filter(({ item }) => item.status === "confirmed" && item.confirmedAt)
    .map(({ item, day }) => (item.confirmedAt!.getTime() - day.capturedAt.getTime()) / 86400000);
  const blockingSites = sites.map((site) => {
    const siteDays = days.filter((day) => day.siteId === site.id);
    const siteEvidence = evidence.filter((e) => e.siteId === site.id);
    const attentionReasons = siteEvidence.filter((e) => e.status === "failed" || (e.checks ?? []).some((c) => !c.passed && c.severity === "blocking"))
      .map((e) => e.errorMessage ?? "blocking evidence check failed");
    return { ...site, visited: siteDays.length > 0, attention: attentionReasons.length > 0, attentionReasons,
      lastCaptureAt: iso(siteDays.reduce<Date | null>((last, d) => !last || d.capturedAt > last ? d.capturedAt : last, null)) };
  });
  const dailyActivity = days.map((day) => {
    const dayItems = items.filter(({ item }) => item.crewDayId === day.id).map(({ item }) => item);
    const site = sites.find((candidate) => candidate.id === day.siteId)!;
    const crew = crews.find((candidate) => candidate.id === day.crewId)!;
    const dayStatusCounts = Object.fromEntries(statuses.map((status) => [
      status, dayItems.filter((item) => item.status === status).length,
    ]));
    const quantityByUnit = Object.fromEntries(["each", "metres"].map((unit) => [
      unit, dayItems.filter((item) => item.unit === unit).reduce((n, item) => n + Number(item.quantity), 0).toFixed(2),
    ]));
    const confirmedQuantityByUnit = Object.fromEntries(["each", "metres"].map((unit) => [
      unit, dayItems.filter((item) => item.status === "confirmed" && item.unit === unit)
        .reduce((n, item) => n + Number(item.quantity), 0).toFixed(2),
    ]));
    return { crewDay: day, capture: { externalId: day.externalId, capturedAt: day.capturedAt.toISOString(), workDate: day.workDate },
      site: { id: site.id, code: site.code, name: site.name }, crew: { id: crew.id, code: crew.code, name: crew.name },
      itemCount: dayItems.length, statusCounts: dayStatusCounts, quantityByUnit, confirmedQuantityByUnit };
  });
  return {
    project: { ...project, createdAt: project.createdAt.toISOString() },
    workTypeRows, statusCounts: counts, items, days, dailyActivity, sites: blockingSites, crews, evidence,
    reviewBacklog: counts.needs_review + counts.proposed, refusalCount: counts.refused,
    unvisitedSiteCount: blockingSites.filter((s) => !s.visited).length,
    attentionSiteCount: blockingSites.filter((s) => s.attention).length,
    todayActivityCount: days.filter((d) => d.workDate === new Date().toISOString().slice(0, 10)).length,
    lastCaptureAt: iso(lastCapture), lastConfirmedAt: iso(confirmedDates.sort((a, b) => b.getTime() - a.getTime())[0]),
    lag: { sampleSize: lagSamples.length, averageDays: lagSamples.length ? Number((lagSamples.reduce((a, b) => a + b, 0) / lagSamples.length).toFixed(2)) : null },
    evidenceCoverage: { total: evidence.length, ready: evidence.filter((e) => e.status === "ready").length,
      manualReview: evidence.filter((e) => e.status === "manual_review").length, failed: evidence.filter((e) => e.status === "failed").length },
  };
}

router.get("/portfolio-summary", async (_req, res) => {
  const projects = await db.select({ id: projectsTable.id }).from(projectsTable).orderBy(asc(projectsTable.id));
  const summaries = await Promise.all(projects.map((p) => projectData(p.id)));
  res.json({ asOf: new Date().toISOString(), projects: summaries.filter(Boolean).map((data) => ({
    ...data!.project, workTypeProgress: data!.workTypeRows, workflowStatusCounts: data!.statusCounts,
    todayActivityCount: data!.todayActivityCount, reviewBacklog: data!.reviewBacklog, refusalCount: data!.refusalCount,
    unvisitedSiteCount: data!.unvisitedSiteCount, attentionSiteCount: data!.attentionSiteCount, lag: data!.lag,
    evidenceCoverage: data!.evidenceCoverage, lastCaptureAt: data!.lastCaptureAt, lastConfirmedAt: data!.lastConfirmedAt,
  })) });
});

router.get("/projects/:projectId/control-room", async (req, res) => {
  const data = await projectData(Number(req.params.projectId));
  if (!data) { res.status(404).json({ error: "Project not found" }); return; }
  res.json({ asOf: new Date().toISOString(), project: data.project, workTypeProgress: data.workTypeRows,
    dailyActivity: data.dailyActivity, reviewBacklog: data.items.filter(({ item }) => ["proposed", "needs_review"].includes(item.status)),
    refusalBacklog: data.items.filter(({ item }) => item.status === "refused"), sites: data.sites, lag: data.lag,
    evidenceCoverage: data.evidenceCoverage, derivedMetrics: { crewProductivity: null, forecastFinish: null, rework: null,
      availability: "unavailable", assumptions: [], missingReasons: ["No complete productivity, forecast, or rework inputs are stored"] } });
});

router.get("/projects/:projectId/facts/:productionItemId", async (req, res) => {
  const projectId = Number(req.params.projectId), itemId = Number(req.params.productionItemId);
  const data = await projectData(projectId);
  const found = data?.items.find(({ item }) => item.id === itemId);
  if (!data || !found || found.item.status !== "confirmed") {
    res.status(404).json({ error: "Confirmed production fact not found in project" });
    return;
  }
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.id, found.day.siteId));
  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, found.day.crewId));
  const [workType] = await db.select().from(workTypesTable).where(eq(workTypesTable.id, found.item.workTypeId));
  const audits = await db.select().from(productionAuditEventsTable).where(eq(productionAuditEventsTable.productionItemId, itemId)).orderBy(asc(productionAuditEventsTable.createdAt));
  const evidence = await db.select().from(evidenceItemsTable).where(and(
    eq(evidenceItemsTable.projectId, projectId),
    or(
      eq(evidenceItemsTable.productionItemId, itemId),
      and(eq(evidenceItemsTable.crewDayId, found.day.id), isNull(evidenceItemsTable.productionItemId)),
    ),
  ));
  const evidenceAudits = evidence.length ? await db.select().from(evidenceAuditEventsTable).where(inArray(evidenceAuditEventsTable.evidenceId, evidence.map((e) => e.id))).orderBy(asc(evidenceAuditEventsTable.createdAt)) : [];
  res.json({ asOf: new Date().toISOString(), project: data.project, site, crew, workType,
    crewDay: found.day, capture: { externalId: found.day.externalId, capturedAt: found.day.capturedAt.toISOString(), workDate: found.day.workDate },
    productionItem: found.item, productionAuditEvents: audits,
    evidence: evidence.map((e) => ({ ...e, auditEvents: evidenceAudits.filter((a) => a.evidenceId === e.id) })) });
});

router.get("/projects/:projectId/evidence-pack", async (req, res) => {
  const data = await projectData(Number(req.params.projectId));
  if (!data) { res.status(404).json({ error: "Project not found" }); return; }
  const filter = req.query.productionItemId ? Number(req.query.productionItemId) : undefined;
  const claims = data.items.filter(({ item }) => (item.status === "confirmed" || item.status === "refused") && (!filter || item.id === filter));
  const audits = claims.length ? await db.select().from(productionAuditEventsTable).where(inArray(productionAuditEventsTable.productionItemId, claims.map(({ item }) => item.id))).orderBy(asc(productionAuditEventsTable.createdAt)) : [];
  const evidence = data.evidence.filter((e) => claims.some(({ item, day }) =>
    e.productionItemId === item.id || (e.productionItemId === null && e.crewDayId === day.id)
  ));
  const evidenceAudits = evidence.length ? await db.select().from(evidenceAuditEventsTable).where(inArray(evidenceAuditEventsTable.evidenceId, evidence.map((e) => e.id))).orderBy(asc(evidenceAuditEventsTable.createdAt)) : [];
  res.json({ asOf: new Date().toISOString(), project: data.project, claims: claims.map(({ item, day }) => ({
    productionItem: item, capture: day, decisions: audits.filter((a) => a.productionItemId === item.id),
    evidence: evidence.filter((e) => e.productionItemId === item.id || (e.productionItemId === null && e.crewDayId === day.id))
      .map((e) => ({ ...e, auditEvents: evidenceAudits.filter((a) => a.evidenceId === e.id) })),
  })) });
});

export default router;