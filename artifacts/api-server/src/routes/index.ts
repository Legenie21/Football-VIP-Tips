import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountsRouter);
// Do not load the imported business routers until the owner confirms the real
// Cybrancee database. Importing them would connect @workspace/db to the default
// DATABASE_URL, which is not necessarily the owner's intended database.
// The original football/admin modules are preserved for the integration step.
router.use((_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({
    error: "Les pronostics et abonnements attendent leur raccordement à Cybrancee. L’inscription et la connexion utilisent un service distinct.",
    code: "INFRASTRUCTURE_NOT_CONFIGURED",
  });
});

export default router;
