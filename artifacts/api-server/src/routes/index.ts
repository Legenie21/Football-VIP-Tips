import { Router, type IRouter } from "express";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
// Do not load the imported business routers until the owner confirms the real
// Cybrancee database. Importing them would connect @workspace/db to the default
// DATABASE_URL, which is not necessarily the owner's intended database.
// The original football/admin modules are preserved for the integration step.
router.use((_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({
    error: "Le service attend la configuration réelle de Cybrancee et de la messagerie.",
    code: "INFRASTRUCTURE_NOT_CONFIGURED",
  });
});

export default router;
