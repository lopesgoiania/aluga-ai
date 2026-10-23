import { Router, type IRouter } from "express";
import healthRouter from "./health";
import monitorRouter from "./monitor";
import panelRouter, { panelError } from "./panel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(monitorRouter);
router.use(panelRouter);
router.use(panelError);

export default router;
