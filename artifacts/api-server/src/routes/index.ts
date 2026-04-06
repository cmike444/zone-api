import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import { requireInternalToken } from "../middlewares/internalAuth.js";
import symbolsRouter from "./symbols.js";
import zonesRouter from "./zones.js";
import scanRouter from "./scan.js";
import chartRouter from "./chart.js";

const router: IRouter = Router();

router.use(healthRouter);

router.use(requireInternalToken);

router.use("/symbols", symbolsRouter);
router.use("/zones", zonesRouter);
router.use("/scan", scanRouter);
router.use("/chart", chartRouter);

export default router;
