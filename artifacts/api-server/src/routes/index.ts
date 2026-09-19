import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import operationsRouter from "./operations";
import evidenceRouter from "./evidence";
import controlRoomRouter from "./control-room";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(operationsRouter);
router.use(evidenceRouter);
router.use(controlRoomRouter);

export default router;
