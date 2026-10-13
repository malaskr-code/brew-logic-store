import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { getClerkProxyHost } from "./clerkProxyMiddleware";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Sign in to manage the catalog." }); return; }
  const adminEmail = process.env.BREW_LOGIC_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) { res.status(503).json({ error: "Administrator access is not configured." }); return; }
  if (req.method !== "GET") {
    const origin = req.get("origin");
    const host = getClerkProxyHost(req);
    let validOrigin = true;
    try { validOrigin = !origin || Boolean(host && new URL(origin).host === host); } catch { validOrigin = false; }
    if (req.get("sec-fetch-site") === "cross-site" || !validOrigin) {
      res.status(403).json({ error: "Cross-site changes are not allowed." }); return;
    }
  }
  try {
    const user = await clerkClient.users.getUser(userId);
    const permitted = user.emailAddresses.some(email => email.emailAddress.toLowerCase() === adminEmail && email.verification?.status === "verified");
    if (!permitted) { res.status(403).json({ error: "This account is not permitted to manage the catalog." }); return; }
    next();
  } catch {
    req.log.warn("Administrator identity verification failed");
    res.status(503).json({ error: "Administrator access could not be verified. Please try again." });
  }
};
