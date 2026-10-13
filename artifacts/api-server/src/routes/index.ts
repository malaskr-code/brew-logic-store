import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import currencyRouter from "./currency";
import catalogRouter from "./catalog";
import customerAuthRouter from "./customer-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(currencyRouter);
router.use(catalogRouter);
router.use(customerAuthRouter);

export default router;
