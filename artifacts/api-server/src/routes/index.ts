import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import footballRouter from "./football";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(footballRouter);
router.use(adminRouter);

export default router;
