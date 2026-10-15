import type { NextRequest } from 'next/server';
import { logger } from '@workspace/brew-server/logger';
import { BodyError, json } from '@/server/http';
import { customerRoute } from '@/server/customer-routes';
import { catalogRoute } from '@/server/catalog-routes';
import { currencyRoute } from '@/server/currency-routes';
import { chatRoute } from '@/server/chat-route';
import { clerkProxy } from '@/server/clerk-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = request.method;
  try {
    if (path === '__clerk' || path.startsWith('__clerk/')) return await clerkProxy(request);
    const allowed = path === 'healthz' || ['products', 'bundles', 'catalog', 'rates', 'geo', 'auth/me'].includes(path)
      ? ['GET', 'HEAD']
      : path === 'admin/catalog' ? ['GET', 'HEAD', 'POST']
      : /^admin\/catalog\/[^/]+$/.test(path) ? ['PUT', 'DELETE']
      : ['chat', 'auth/signup', 'auth/login', 'auth/logout'].includes(path) ? ['POST'] : null;
    if (!allowed) return json({ error: 'Not found.' }, 404);
    if (!allowed.includes(method)) return json({ error: 'Method not allowed.' }, 405, { Allow: allowed.join(', ') });
    if (path === 'healthz') return json({ status: 'ok' });
    if (path.startsWith('auth/')) return await customerRoute(request, path.slice(5));
    if (['rates', 'geo'].includes(path)) return await currencyRoute(request, path);
    if (path === 'chat') return await chatRoute(request);
    return await catalogRoute(request, path);
  } catch (error) {
    if (error instanceof BodyError) return json({ error: 'Invalid request.', code: 'validation' }, error.status);
    logger.error({ path, method }, 'Request could not be completed');
    return json({ error: 'Request could not be completed.', code: 'unavailable' }, 500);
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE, handle as HEAD, handle as PATCH, handle as OPTIONS };
