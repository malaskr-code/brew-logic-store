import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { CreateCheckoutBody, GetCheckoutSessionQueryParams, GetCheckoutSessionResponse, CreateCheckoutResponse } from '@workspace/api-zod';
import { createTestCheckout, verifyTestCheckout, checkoutHash, CheckoutOrderError } from '@workspace/brew-server/checkout-service';
import { CheckoutInputError } from '@workspace/brew-server/checkout-pricing';
import { StripeConfigurationError } from '@workspace/brew-server/stripe-client';
import { logger } from '@workspace/brew-server/logger';
import { json, readJson, sameOrigin, requestHost } from './http';
import { WebhookHandlers } from './stripeClient';

const COOKIE = '__Host-brew_checkout';
function setOwnerCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
  return response;
}

export async function checkoutRoute(request: NextRequest, path: string) {
  const existing = request.cookies.get(COOKIE)?.value;
  const owner = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : null;
  if (path === 'checkout/session' && !owner) return json({ error: 'Checkout not found.' }, 404);
  if (path === 'checkout' && !sameOrigin(request)) return json({ error: 'Cross-site changes are not allowed.' }, 403);
  const token = owner || randomBytes(32).toString('hex');
  const ownerHash = checkoutHash(token);
  // Parse outside service error handling so malformed JSON keeps its 400/413.
  const raw = path === 'checkout' ? await readJson(request) : undefined;
  try {
    if (path === 'checkout/session') {
      const parsed = GetCheckoutSessionQueryParams.safeParse({ session_id: request.nextUrl.searchParams.get('session_id') });
      if (!parsed.success) return json({ error: 'Invalid checkout session.' }, 400);
      return json(GetCheckoutSessionResponse.parse(await verifyTestCheckout(parsed.data.session_id, ownerHash)));
    }
    const parsed = CreateCheckoutBody.strict().safeParse(raw);
    if (!parsed.success) return json({ error: 'Check the cart items and quantities.' }, 400);
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || request.nextUrl.protocol.replace(':', '');
    const origin = new URL(`${protocol}://${requestHost(request)}`).origin;
    if (!['https:', 'http:'].includes(new URL(origin).protocol)) return json({ error: 'Invalid checkout origin.' }, 400);
    return setOwnerCookie(json(CreateCheckoutResponse.parse(
      await createTestCheckout(parsed.data, ownerHash, origin),
    ), 201), token);
  } catch (error) {
    if (error instanceof CheckoutInputError) return setOwnerCookie(json({ error: 'An item is unavailable or has an unsupported checkout price.' }, 400), token);
    if (error instanceof CheckoutOrderError)
      return setOwnerCookie(json({ error: error.status === 404 ? 'Checkout not found.' : error.status === 429
        ? 'Too many checkout attempts. Please try again later.' : 'Checkout changed or is no longer open. Please try again.' }, error.status), token);
    const safeCode = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_\[\]]{1,80}$/.test(value) ? value : undefined;
    logger.warn({
      failure: error instanceof StripeConfigurationError ? 'configuration' : error instanceof Error ? error.name : 'unknown',
      providerCode: error && typeof error === 'object' && 'code' in error ? safeCode(error.code) : undefined,
      parameter: error && typeof error === 'object' && 'param' in error ? safeCode(error.param) : undefined,
    }, 'Stripe test checkout request failed');
    return setOwnerCookie(json({ error: 'Test checkout is temporarily unavailable. Your cart has not changed.' }, 503), token);
  }
}

export async function stripeWebhookRoute(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature || signature.length > 1024) return json({ error: 'Missing webhook signature.' }, 400);
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 1024 * 1024) return json({ error: 'Webhook too large.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Invalid webhook.' }, 400);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) { await reader.cancel(); return json({ error: 'Webhook too large.' }, 413); }
      parts.push(value);
    }
    await WebhookHandlers.processWebhook(Buffer.concat(parts), signature);
    return json({ received: true });
  } catch (error) {
    // Bad signatures do not get retried; actual sync/storage failures must.
    const invalid = Boolean(error && typeof error === 'object' && 'type' in error
      && error.type === 'StripeSignatureVerificationError')
      || error instanceof Error && /No signatures found|Timestamp outside|Unable to extract timestamp/i.test(error.message);
    if (!invalid) logger.warn('Stripe webhook synchronization failed');
    return json({ error: invalid ? 'Invalid webhook signature.' : 'Webhook could not be processed.' }, invalid ? 400 : 503);
  } finally { reader.releaseLock(); }
}
