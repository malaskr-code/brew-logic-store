import { isIP } from "node:net";
import { GetExchangeRatesResponse, GetVisitorGeoResponse } from "@workspace/api-zod";

export function resolveVisitorIp(forwarded: string | string[] | undefined, testip: unknown) {
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const value = testip !== undefined ? testip : header?.split(",")[0]?.trim();
  return typeof value === "string" && isIP(value) ? value : null;
}

export async function locateVisitor(ip: string, baseUrl: string, fetcher: typeof fetch = fetch) {
  // Refuse missing or invalid IPs before making any provider request.
  if (!isIP(ip)) throw new Error("Visitor IP required");
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(ip)}`);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Location unavailable");
  const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Location unavailable");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("currencies" in payload) || !Array.isArray(payload.currencies)) {
    throw new Error("Invalid location response");
  }
  const firstCurrency: unknown = payload.currencies[0];
  return GetVisitorGeoResponse.parse({
    countryCode: "countryCode" in payload && typeof payload.countryCode === "string" ? payload.countryCode : null,
    currency: typeof firstCurrency === "string" ? firstCurrency : null,
  });
}

export async function fetchExchangeRates(fetcher: typeof fetch = fetch) {
  const response = await fetcher("https://open.er-api.com/v6/latest/KWD", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Exchange rates unavailable");
  const rates = GetExchangeRatesResponse.parse(await response.json());
  if (rates.rates.KWD !== 1 || !Object.values(rates.rates).every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("Invalid exchange rates");
  }
  return rates;
}

let rateCache: { at: number; value: Awaited<ReturnType<typeof fetchExchangeRates>> } | undefined;
let rateRequest: Promise<Awaited<ReturnType<typeof fetchExchangeRates>>> | undefined;
export async function getCachedExchangeRates() {
  if (rateCache && Date.now() - rateCache.at < 86400000) return rateCache.value;
  if (!rateRequest) rateRequest = fetchExchangeRates().then(value => {
    rateCache = { at: Date.now(), value };
    return value;
  }).finally(() => { rateRequest = undefined; });
  return rateRequest;
}
