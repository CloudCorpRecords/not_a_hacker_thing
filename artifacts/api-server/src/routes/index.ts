import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import operationsRouter from "./operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(operationsRouter);

export default router;
