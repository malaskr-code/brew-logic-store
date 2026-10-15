import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { getUncachableStripeClient } from './stripe-client';
import { getMongoDatabase, closeMongoDatabase } from './mongo';

test('real test checkout: KWD catalog, confirmed USD quote, ownership and idempotency', {
  skip: process.env.RUN_STRIPE_INTEGRATION_TESTS !== '1', timeout: 90000,
}, async () => {
  const base = 'http://localhost:80/api';
  let sessionId: string | undefined;
  let quoteId: string | undefined;
  const call = (path: string, body?: unknown, cookie?: string, headers = {}) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const products = await (await call('/products')).json();
    const product = products.filter((item: { price: number }) => item.price >= 0.15).sort((a: { price: number }, b: { price: number }) => a.price - b.price)[0];
    assert.ok(product, 'A live catalog product must exist');
    const input = { items: [{ id: product.id, quantity: 1 }], language: 'en', requestId: randomUUID() };
    assert.ok((await call('/checkout/quote', { ...input, items: [] })).status === 400);
    assert.ok((await call('/checkout/quote', { ...input, total: 0 })).status === 400);
    assert.ok((await call('/checkout/quote', { ...input, items: [{ id: 'not-in-catalog', quantity: 1 }] })).status === 400);
    assert.ok((await call('/checkout/quote', input, undefined, { Origin: 'https://unrelated.example', 'Sec-Fetch-Site': 'cross-site' })).status === 403);
    const quoteResponse = await call('/checkout/quote', input);
    assert.ok(quoteResponse.status === 201, 'USD quote must be available before payment');
    const cookieHeader = quoteResponse.headers.get('set-cookie') || '';
    assert.ok(/HttpOnly/i.test(cookieHeader) && /Secure/i.test(cookieHeader) && /SameSite=Lax/i.test(cookieHeader));
    const cookie = cookieHeader.split(';')[0];
    const quote = await quoteResponse.json();
    quoteId = quote.quoteId;
    assert.ok(quote.amountKwd === product.price && quote.amountUsd === Math.round(product.price * quote.rate * 100) / 100);
    assert.ok((await call('/checkout', { quoteId })).status === 404, 'Only the quote owner can confirm payment');
    assert.ok((await call('/checkout', { quoteId, amountUsd: 0 }, cookie)).status === 400, 'The confirmation cannot override its quote');
    const response = await call('/checkout', { quoteId }, cookie);
    assert.ok(response.status === 201, 'Test checkout must be available after confirmation');
    const created = await response.json();
    sessionId = created.sessionId;
    assert.ok(sessionId?.startsWith('cs_test_') && new URL(created.url).hostname === 'checkout.stripe.com');
    const retry = await call('/checkout', { quoteId }, cookie);
    assert.ok(retry.status === 201 && (await retry.json()).sessionId === sessionId, 'Retries must reuse checkout');
    assert.ok((await call(`/checkout/session?session_id=${sessionId}`)).status === 404, 'Other visitors cannot read checkout');
    const result = await (await call(`/checkout/session?session_id=${sessionId}`, undefined, cookie)).json();
    assert.ok(result.status === 'pending' && result.amountKwd === product.price && result.amountUsd === quote.amountUsd, 'Only the confirmed server quote is charged');
    const stripe = await getUncachableStripeClient();
    await stripe.checkout.sessions.expire(sessionId!);
    const expired = await (await call(`/checkout/session?session_id=${sessionId}`, undefined, cookie)).json();
    assert.ok(expired.status === 'expired', 'Expired sessions must never report payment');
    const missingSignature = await call('/stripe/webhook', {});
    const badSignature = await call('/stripe/webhook', {}, undefined, { 'stripe-signature': 't=1,v1=invalid' });
    assert.ok(missingSignature.status === 400 && badSignature.status === 400, 'Unsigned webhooks must be rejected');
  } catch {
    throw new Error('Stripe checkout integration failed; inspect sanitized route statuses. No payment was submitted by this test.');
  } finally {
    try {
      if (sessionId) {
        const stripe = await getUncachableStripeClient();
        await stripe.checkout.sessions.expire(sessionId).catch(() => undefined);
      }
      if (quoteId) await (await getMongoDatabase()).collection('orders').deleteOne({ _id: quoteId, status: 'pending', testMode: true });
    } finally { await closeMongoDatabase(); }
  }
});
