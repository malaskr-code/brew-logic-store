import 'server-only';
import type { NextRequest } from 'next/server';
import { fetchExchangeRates, locateVisitor, resolveVisitorIp } from '@workspace/brew-server/currency-services';
import { logger } from '@workspace/brew-server/logger';
import { json } from './http';

const empty = { countryCode: null, currency: null };
let cache: { at: number; response: Awaited<ReturnType<typeof fetchExchangeRates>> } | null = null;
let pending: Promise<Awaited<ReturnType<typeof fetchExchangeRates>>> | null = null;

export async function currencyRoute(request: NextRequest, path: string) {
  if (path === 'geo') {
    const ip = resolveVisitorIp(request.headers.get('x-forwarded-for') ?? undefined, request.nextUrl.searchParams.get('testip') ?? undefined);
    if (!ip) return json(empty, 400);
    if (!process.env.GEO_API_URL) return json(empty, 503);
    try { return json(await locateVisitor(ip, process.env.GEO_API_URL)); }
    catch { logger.warn('Visitor location request failed'); return json(empty, 503); }
  }
  try {
    if (cache && Date.now() - cache.at < 86400000) return json(cache.response);
    if (!pending) pending = fetchExchangeRates().then(response => {
      cache = { at: Date.now(), response };
      return response;
    }).finally(() => { pending = null; });
    return json(await pending);
  } catch { return new Response(null, { status: 503 }); }
}
