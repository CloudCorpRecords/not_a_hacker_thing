import { and, eq } from "drizzle-orm";
import {
  crewCertificationsTable,
  crewsTable,
  productionPlansTable,
  sitesTable,
  subcontractorsTable,
  workTypesTable,
} from "@workspace/db";

type Transaction = Parameters<Parameters<typeof import("@workspace/db").db.transaction>[0]>[0];

const WORK_TYPES = [
  { code: "DRAWINGS", name: "Drawings", stageNumber: 1, unit: "each", maxPerCrewDay: "25", plannedQuantity: "12" },
  { code: "LOCATE", name: "Utility Locates", stageNumber: 2, unit: "each", maxPerCrewDay: "100", plannedQuantity: "74" },
  { code: "HYDROVAC", name: "Hydrovac", stageNumber: 3, unit: "each", maxPerCrewDay: "40", plannedQuantity: "27" },
  { code: "TRENCH", name: "Trenching", stageNumber: 4, unit: "metres", maxPerCrewDay: "1200", plannedQuantity: "4118" },
  { code: "CONDUIT", name: "Conduit Placement", stageNumber: 5, unit: "metres", maxPerCrewDay: "1200", plannedQuantity: "3724" },
  { code: "JETTING", name: "Fiber Jetting", stageNumber: 6, unit: "metres", maxPerCrewDay: "1500", plannedQuantity: "3724" },
  { code: "SPLICE", name: "Splicing & Testing", stageNumber: 7, unit: "each", maxPerCrewDay: "80", plannedQuantity: "186" },
  { code: "RESTORE", name: "Restoration & Sign-off", stageNumber: 8, unit: "metres", maxPerCrewDay: "800", plannedQuantity: "882" },
] as const;

export async function ensureProjectOperationalFoundation(
  tx: Transaction,
  project: { id: number; name: string; location: string },
) {
  await tx
    .insert(subcontractorsTable)
    .values({ code: "NORTHSTAR", name: "Northstar Utility Services" })
    .onConflictDoNothing({ target: subcontractorsTable.code });
  const [subcontractor] = await tx
    .select()
    .from(subcontractorsTable)
    .where(eq(subcontractorsTable.code, "NORTHSTAR"));

  await tx
    .insert(crewsTable)
    .values({
      subcontractorId: subcontractor.id,
      code: "CREW-C1",
      name: "Northgate C1",
      foremanName: "Field Foreman",
      headcount: 4,
    })
    .onConflictDoNothing({ target: crewsTable.code });
  const [crew] = await tx.select().from(crewsTable).where(eq(crewsTable.code, "CREW-C1"));

  for (const template of WORK_TYPES) {
    await tx
      .insert(workTypesTable)
      .values(template)
      .onConflictDoNothing({ target: workTypesTable.code });
  }
  const workTypes = await tx.select().from(workTypesTable);

  for (const workType of workTypes) {
    await tx
      .insert(crewCertificationsTable)
      .values({ crewId: crew.id, workTypeId: workType.id })
      .onConflictDoNothing();
  }

  const siteCode = `PROJECT-${project.id}`;
  await tx
    .insert(sitesTable)
    .values({
      projectId: project.id,
      code: siteCode,
      name: `${project.location} primary build`,
    })
    .onConflictDoNothing({ target: [sitesTable.projectId, sitesTable.code] });
  const [site] = await tx
    .select()
    .from(sitesTable)
    .where(and(eq(sitesTable.projectId, project.id), eq(sitesTable.code, siteCode)));

  for (const workType of workTypes) {
    const template = WORK_TYPES.find((candidate) => candidate.code === workType.code);
    if (!template) continue;
    await tx
      .insert(productionPlansTable)
      .values({
        projectId: project.id,
        siteId: site.id,
        workTypeId: workType.id,
        plannedQuantity: template.plannedQuantity,
      })
      .onConflictDoNothing();
  }
}