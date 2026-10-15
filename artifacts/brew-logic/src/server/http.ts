import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function requestHost(request: Request) {
  return (request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host)
    .split(',')[0].trim();
}

export function sameOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  try { return !origin || new URL(origin).host === requestHost(request); }
  catch { return false; }
}

export class BodyError extends Error {
  constructor(readonly status: 400 | 413) { super('Invalid request.'); }
}

export async function readJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100 * 1024) { await reader.cancel(); throw new BodyError(413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof BodyError) throw error;
    throw new BodyError(400);
  } finally { reader.releaseLock(); }
}
