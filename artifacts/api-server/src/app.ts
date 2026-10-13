import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));

app.use("/api", router);
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  // Do not echo parser errors, request bodies, credentials, or upstream connection details.
  const status = error && typeof error === "object" && "status" in error ? error.status : 500;
  if (res.headersSent) { res.end(); return; }
  const code = status === 400 || status === 413 ? status : 500;
  if (code === 500) req.log.error("Request could not be completed");
  res.status(code).json({ error: code === 500 ? "Request could not be completed." : "Invalid request.", code: code === 500 ? "unavailable" : "validation" });
});

export default app;
