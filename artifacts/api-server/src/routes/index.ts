import { Router, type IRouter } from "express";
import healthRouter from "./health";
import panelRouter, { panelError } from "./panel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(panelRouter);
router.use(panelError);

export default router;
