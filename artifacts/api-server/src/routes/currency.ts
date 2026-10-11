import { Router, type IRouter } from "express";
import { fetchExchangeRates, locateVisitor, resolveVisitorIp } from "../lib/currency-services";

const router: IRouter = Router();
const emptyLocation = { countryCode: null, currency: null };
let rateCache: { fetchedAt: number; response: Awaited<ReturnType<typeof fetchExchangeRates>> } | null = null;
let rateRequest: Promise<Awaited<ReturnType<typeof fetchExchangeRates>>> | null = null;

router.get("/geo", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const ip = resolveVisitorIp(req.headers["x-forwarded-for"], req.query.testip);
  if (!ip) {
    res.status(400).json(emptyLocation);
    return;
  }
  const baseUrl = process.env.GEO_API_URL;
  if (!baseUrl) {
    res.status(503).json(emptyLocation);
    return;
  }
  try {
    res.json(await locateVisitor(ip, baseUrl));
  } catch {
    // Provider URLs and response bodies may contain secrets or visitor data.
    req.log.warn("Visitor location request failed");
    res.status(503).json(emptyLocation);
  }
});

router.get("/rates", async (_req, res): Promise<void> => {
  try {
    if (rateCache && Date.now() - rateCache.fetchedAt < 86400000) {
      res.json(rateCache.response);
      return;
    }
    if (!rateRequest) {
      rateRequest = fetchExchangeRates().then(response => {
        rateCache = { fetchedAt: Date.now(), response };
        return response;
      }).finally(() => { rateRequest = null; });
    }
    res.json(await rateRequest);
  } catch {
    res.status(503).end();
  }
});

export default router;
