import { Router, type Request, type Response, type RequestHandler } from "express";
import { isIP } from "node:net";
import { SignupCustomerBody, LoginCustomerBody, SignupCustomerResponse, LoginCustomerResponse, GetCustomerSessionResponse } from "@workspace/api-zod";
import { signupCustomer, loginCustomer, getCustomerSession, CUSTOMER_COOKIE, SESSION_DURATION, customerCookieOptions, EmailInUseError, InvalidCredentialsError, AuthAttemptLimiter, CustomerAuthConfigurationError } from "../lib/customer-auth";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";

const router = Router();
const limiter = new AuthAttemptLimiter();

const guardOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  let valid = true;
  try { valid = !origin || new URL(origin).host === getClerkProxyHost(req); } catch { valid = false; }
  if (!valid || req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Cross-site account requests are not allowed.", code: "cross_site" });
    return;
  }
  next();
};

function ipKey(req: Request) {
  const first = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && isIP(first) ? first : req.socket.remoteAddress || "unknown";
}

function errorResponse(req: Request, res: Response, error: unknown) {
  if (error instanceof EmailInUseError) { res.status(409).json({ error: "This email is already in use.", code: "email_in_use" }); return; }
  if (error instanceof InvalidCredentialsError) { res.status(401).json({ error: "Email or password is incorrect", code: "invalid_credentials" }); return; }
  if (error instanceof CustomerAuthConfigurationError) req.log.warn({ reason: error.reason }, "JWT signing configuration unavailable");
  else req.log.warn("Customer account operation unavailable");
  res.status(503).json({ error: "Accounts are temporarily unavailable. Please try again.", code: "unavailable" });
}

router.use("/auth", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

router.post("/auth/signup", guardOrigin, async (req, res): Promise<void> => {
  if (!limiter.allow(`signup:${ipKey(req)}`, 10, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many attempts. Please try again later.", code: "rate_limited" }); return;
  }
  const body = req.body && typeof req.body === "object" ? { ...req.body, email: typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : req.body.email } : req.body;
  const parsed = SignupCustomerBody.safeParse(body);
  if (!req.is("application/json") || !parsed.success || !parsed.data.name.trim() || Array.from(parsed.data.password).length < 8 || Buffer.byteLength(parsed.data.password) > 72) {
    res.status(400).json({ error: "Enter a name, valid email, and password of at least 8 characters (maximum 72 bytes).", code: "validation" }); return;
  }
  try {
    const session = await signupCustomer(parsed.data);
    res.cookie(CUSTOMER_COOKIE, session.token, { ...customerCookieOptions, maxAge: SESSION_DURATION });
    res.status(201).json(SignupCustomerResponse.parse({ user: session.user }));
  } catch (error) { errorResponse(req, res, error); }
});

router.post("/auth/login", guardOrigin, async (req, res): Promise<void> => {
  const body = req.body && typeof req.body === "object" ? { ...req.body, email: typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : req.body.email } : req.body;
  const parsed = LoginCustomerBody.safeParse(body);
  if (!limiter.allow(`login:${ipKey(req)}`, 10, 60 * 1000)) {
    res.status(429).json({ error: "Too many attempts. Please try again in a minute.", code: "rate_limited" }); return;
  }
  if (!req.is("application/json") || !parsed.success || Array.from(parsed.data.password).length < 8 || Buffer.byteLength(parsed.data.password) > 72) {
    res.status(401).json({ error: "Email or password is incorrect", code: "invalid_credentials" }); return;
  }
  if (!limiter.allow(`email:${parsed.data.email}`, 20, 60 * 1000)) {
    res.status(429).json({ error: "Too many attempts. Please try again in a minute.", code: "rate_limited" }); return;
  }
  try {
    const session = await loginCustomer(parsed.data);
    res.cookie(CUSTOMER_COOKIE, session.token, { ...customerCookieOptions, maxAge: SESSION_DURATION });
    res.json(LoginCustomerResponse.parse({ user: session.user }));
  } catch (error) { errorResponse(req, res, error); }
});

router.post("/auth/logout", guardOrigin, (_req, res) => {
  res.clearCookie(CUSTOMER_COOKIE, customerCookieOptions);
  res.status(204).end();
});

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const user = await getCustomerSession(req.cookies?.[CUSTOMER_COOKIE]);
    if (!user && req.cookies?.[CUSTOMER_COOKIE]) res.clearCookie(CUSTOMER_COOKIE, customerCookieOptions);
    res.json(GetCustomerSessionResponse.parse({ user }));
  } catch (error) { errorResponse(req, res, error); }
});

export default router;
