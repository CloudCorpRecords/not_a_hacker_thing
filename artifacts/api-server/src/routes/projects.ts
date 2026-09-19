import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, projectsTable, type StageRecord } from "@workspace/db";
import {
  CreateProjectBody,
  CreateProjectResponse,
  GetProjectParams,
  GetProjectResponse,
  ListProjectsResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
  UpdateStageBody,
  UpdateStageParams,
  UpdateStageResponse,
} from "@workspace/api-zod";
import { ensureProjectOperationalFoundation } from "../lib/operational-foundation";

const router: IRouter = Router();

const stageTemplates: Omit<StageRecord, "status" | "owner" | "completedAt" | "note" | "evidenceName">[] = [
  { number: 1, name: "Drawings", phase: "Plan", description: "Plan + permits" },
  { number: 2, name: "Utility Locates", phase: "Plan", description: "Mark what is underground" },
  { number: 3, name: "Hydrovac", phase: "Build", description: "Safely expose crossings" },
  { number: 4, name: "Trenching", phase: "Build", description: "Open the route" },
  { number: 5, name: "Conduit Placement", phase: "Build", description: "Install protective pipe" },
  { number: 6, name: "Fiber Jetting", phase: "Connect", description: "Pull / blow cable" },
  { number: 7, name: "Splicing & Testing", phase: "Connect", description: "Connect and verify" },
  { number: 8, name: "Restoration & Sign-off", phase: "Close", description: "Repair and close" },
];

const emptyStages = (): StageRecord[] => stageTemplates.map((stage) => ({
  ...stage,
  status: "not_started",
  owner: "",
  completedAt: null,
  note: "",
  evidenceName: "",
}));

const serialize = (project: typeof projectsTable.$inferSelect) => ({
  ...project,
  createdAt: project.createdAt.toISOString(),
});

router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).orderBy(asc(projectsTable.id));
  res.json(ListProjectsResponse.parse(projects.map(serialize)));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(projectsTable)
      .values({ ...parsed.data, stages: emptyStages() })
      .returning();
    await ensureProjectOperationalFoundation(tx, created);
    return created;
  });
  res.status(201).json(CreateProjectResponse.parse(serialize(project)));
});

router.get("/projects/:projectId", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(GetProjectResponse.parse(serialize(project)));
});

router.patch("/projects/:projectId", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  const body = UpdateProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid project update" });
    return;
  }
  const [project] = await db.update(projectsTable).set(body.data).where(eq(projectsTable.id, params.data.projectId)).returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(UpdateProjectResponse.parse(serialize(project)));
});

router.patch("/projects/:projectId/stages/:stageNumber", async (req, res): Promise<void> => {
  const params = UpdateStageParams.safeParse(req.params);
  const body = UpdateStageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid handoff update" });
    return;
  }
  const [current] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.projectId));
  if (!current) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const stages = current.stages.map((stage) =>
    stage.number === params.data.stageNumber ? { ...stage, ...body.data } : stage,
  );
  const [project] = await db.update(projectsTable).set({ stages }).where(eq(projectsTable.id, current.id)).returning();
  res.json(UpdateStageResponse.parse(serialize(project)));
});

export default router;