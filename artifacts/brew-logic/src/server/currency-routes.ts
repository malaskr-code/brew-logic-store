import 'server-only';
import type { NextRequest } from 'next/server';
import { getCachedExchangeRates, locateVisitor, resolveVisitorIp } from '@workspace/brew-server/currency-services';
import { logger } from '@workspace/brew-server/logger';
import { json } from './http';

const empty = { countryCode: null, currency: null };

export async function currencyRoute(request: NextRequest, path: string) {
  if (path === 'geo') {
    const ip = resolveVisitorIp(request.headers.get('x-forwarded-for') ?? undefined, request.nextUrl.searchParams.get('testip') ?? undefined);
    if (!ip) return json(empty, 400);
    if (!process.env.GEO_API_URL) return json(empty, 503);
    try { return json(await locateVisitor(ip, process.env.GEO_API_URL)); }
    catch { logger.warn('Visitor location request failed'); return json(empty, 503); }
  }
  try {
    return json(await getCachedExchangeRates());
  } catch { return new Response(null, { status: 503 }); }
}
