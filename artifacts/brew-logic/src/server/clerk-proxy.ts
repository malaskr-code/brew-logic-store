import 'server-only';
import type { NextRequest } from 'next/server';
import { requestHost } from './http';
import { logger } from '@workspace/brew-server/logger';

const prefix = '/api/__clerk';

export async function clerkProxy(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production' || !process.env.CLERK_SECRET_KEY) return new Response(null, { status: 404 });
  const headers = new Headers(request.headers);
  for (const key of ['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive']) headers.delete(key);
  headers.set('accept-encoding', 'identity');
  headers.set('Clerk-Secret-Key', process.env.CLERK_SECRET_KEY);
  headers.set('Clerk-Proxy-Url', `${request.headers.get('x-forwarded-proto')?.split(',')[0] || 'https'}://${requestHost(request)}${prefix}`);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (ip) headers.set('X-Forwarded-For', ip);
  const url = new URL(request.url);
  const target = `https://frontend-api.clerk.dev${url.pathname.slice(prefix.length) || '/'}${url.search}`;
  try {
    const upstream = await fetch(target, {
      method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      duplex: 'half', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30000),
    } as RequestInit & { duplex: string });
    const responseHeaders = new Headers(upstream.headers);
    for (const key of ['connection', 'transfer-encoding', 'keep-alive', 'content-encoding', 'content-length']) responseHeaders.delete(key);
    return new Response(request.method === 'HEAD' || [204, 304].includes(upstream.status) ? null : upstream.body, {
      status: upstream.status, headers: responseHeaders,
    });
  } catch {
    logger.warn('Clerk proxy request failed');
    return new Response(null, { status: 502 });
  }
}
