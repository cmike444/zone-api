import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { registerRoutes } from "./register.js";
import { ROUTES } from "./health.meta.js";

const router: IRouter = Router();

registerRoutes(router as ReturnType<typeof Router>, ROUTES, {
  healthCheck: (_req, res) => {
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  },
});

export default router;
