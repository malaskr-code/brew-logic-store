import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { MongoServerError } from 'mongodb';
import type { CheckoutInput } from '@workspace/api-zod';
import { getCatalog } from './catalog-service';
import { getMongoDatabase } from './mongo';
import { priceCheckout } from './checkout-pricing';
import { getUncachableStripeClient, initializeStripe } from './stripe-client';

type PricedLine = ReturnType<typeof priceCheckout>['lines'][number];
type TestOrder = {
  _id: string; ownerHash: string; fingerprint: string; lines: PricedLine[];
  amount: number; origin: string; language: 'en' | 'ar'; createdAt: Date;
  sessionId?: string; status: 'pending' | 'paid'; paidAt?: Date; testMode: true;
};

export class CheckoutOrderError extends Error {
  constructor(readonly status: 404 | 409 | 429) { super('Checkout is not available.'); }
}
export const checkoutHash = (value: string) => createHash('sha256').update(value).digest('hex');

async function stripePrice(stripe: Stripe, line: PricedLine): Promise<string> {
  const identity = checkoutHash(`${line.kind}:${line.id}`).slice(0, 32);
  const productId = `brew_logic_${identity}`;
  let product: Stripe.Product;
  try {
    const retrieved = await stripe.products.retrieve(productId);
    if (retrieved.deleted) throw new CheckoutOrderError(409);
    product = retrieved;
    if (product.metadata.brewCatalogId !== line.id || product.metadata.app !== 'brew-logic')
      throw new CheckoutOrderError(409);
    if (product.name !== line.name) product = await stripe.products.update(productId, { name: line.name });
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'resource_missing')) throw error;
    product = await stripe.products.create({
      id: productId, name: line.name,
      metadata: { app: 'brew-logic', brewCatalogId: line.id, kind: line.kind },
    }, { idempotencyKey: `brew-product-${identity}` });
  }
  const lookupKey = `brew_kwd_${identity}_${line.unitAmount}`;
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0] ?? await stripe.prices.create({
    product: product.id, currency: 'kwd', unit_amount: line.unitAmount, lookup_key: lookupKey,
    metadata: { app: 'brew-logic', brewCatalogId: line.id },
  }, { idempotencyKey: lookupKey });
  if (price.livemode || price.currency !== 'kwd' || price.unit_amount !== line.unitAmount || price.product !== product.id)
    throw new CheckoutOrderError(409);
  return price.id;
}

export async function createTestCheckout(input: CheckoutInput, ownerHash: string, origin: string) {
  const catalog = await getCatalog();
  const priced = priceCheckout(input.items, [...catalog.products, ...catalog.bundles]);
  const orders = (await getMongoDatabase()).collection<TestOrder>('orders');
  const orderId = `order_${checkoutHash(`${ownerHash}:${input.requestId}`).slice(0, 40)}`;
  const fingerprint = checkoutHash(JSON.stringify([...input.items].sort((a, b) => a.id.localeCompare(b.id))));
  let order = await orders.findOne({ _id: orderId });
  if (!order) {
    const count = await orders.countDocuments({
      ownerHash, createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    }, { limit: 20 });
    if (count >= 20) throw new CheckoutOrderError(429);
    const candidate: TestOrder = {
      _id: orderId, ownerHash, fingerprint, lines: priced.lines, amount: priced.total,
      origin, language: input.language, status: 'pending', createdAt: new Date(), testMode: true,
    };
    try { await orders.insertOne(candidate); order = candidate; }
    catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      order = await orders.findOne({ _id: orderId });
    }
  }
  if (!order || order.fingerprint !== fingerprint || order.ownerHash !== ownerHash)
    throw new CheckoutOrderError(409);
  await initializeStripe();
  const stripe = await getUncachableStripeClient();
  if (order.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(order.sessionId);
    if (session.livemode || session.status !== 'open' || !session.url) throw new CheckoutOrderError(409);
    return { sessionId: session.id, url: session.url };
  }
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const line of order.lines) lineItems.push({ price: await stripePrice(stripe, line), quantity: line.quantity });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', allowed_payment_method_types: ['card'], line_items: lineItems,
    success_url: `${order.origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${order.origin}/?checkout=cancelled`,
    locale: order.language, billing_address_collection: 'required',
    shipping_address_collection: { allowed_countries: ['KW'] },
    phone_number_collection: { enabled: true },
    client_reference_id: order._id,
    metadata: { app: 'brew-logic', brewOrderId: order._id },
    expires_at: Math.floor(order.createdAt.getTime() / 1000) + 3600,
  }, { idempotencyKey: `checkout-${order._id}` });
  if (session.livemode || !session.url || new URL(session.url).hostname !== 'checkout.stripe.com')
    throw new CheckoutOrderError(409);
  await orders.updateOne({ _id: order._id, ownerHash }, { $set: { sessionId: session.id } });
  return { sessionId: session.id, url: session.url };
}

export async function verifyTestCheckout(sessionId: string, ownerHash: string) {
  const orders = (await getMongoDatabase()).collection<TestOrder>('orders');
  const order = await orders.findOne({ sessionId, ownerHash, testMode: true });
  if (!order) throw new CheckoutOrderError(404);
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.livemode || session.mode !== 'payment' || session.currency !== 'kwd'
    || session.amount_total !== order.amount || session.metadata?.brewOrderId !== order._id
    || session.client_reference_id !== order._id) throw new CheckoutOrderError(409);
  const status = session.status === 'complete' && session.payment_status === 'paid' ? 'paid'
    : session.status === 'expired' ? 'expired' : 'pending';
  if (status === 'paid') await orders.updateOne(
    { _id: order._id, ownerHash, status: 'pending' }, { $set: { status: 'paid', paidAt: new Date() } },
  );
  return {
    sessionId: session.id, status, amountKwd: order.amount / 1000,
    items: order.lines.map(({ id, quantity }) => ({ id, quantity })),
  };
}
