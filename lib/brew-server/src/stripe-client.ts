import Stripe from 'stripe';
import { StripeSync, runMigrations } from 'stripe-replit-sync';

export class StripeConfigurationError extends Error {
  constructor() { super('Test checkout is not configured.'); }
}

// Only server-side test credentials are accepted. Never fall back to a live
// account, even if someone changes an environment variable while deploying.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) throw new StripeConfigurationError();
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}

let sync: StripeSync | undefined;
let initialization: Promise<void> | undefined;

export async function getStripeSync() {
  await getUncachableStripeClient(); // enforce test mode before any sync operation
  if (!process.env.DATABASE_URL) throw new StripeConfigurationError();
  return sync ??= new StripeSync({
    poolConfig: {
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    },
    stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // Do not log upstream errors, customer details, signatures, or credentials.
    logger: { info() {}, warn() {}, error() {} },
  });
}

export function initializeStripe(): Promise<void> {
  if (!initialization) initialization = (async () => {
    await getUncachableStripeClient();
    const databaseUrl = process.env.DATABASE_URL;
    const webhookUrl = process.env.STRIPE_WEBHOOK_URL
      || (process.env.NODE_ENV !== 'production' && process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/stripe/webhook` : '');
    if (!databaseUrl || !webhookUrl) throw new StripeConfigurationError();
    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/api/stripe/webhook') throw new StripeConfigurationError();
    // This is Stripe's own managed schema, not the store's MongoDB catalog/users.
    await runMigrations({ databaseUrl });
    const stripeSync = await getStripeSync();
    await stripeSync.findOrCreateManagedWebhook(url.toString());
    await stripeSync.syncBackfill({ object: 'all' });
  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    if (!Buffer.isBuffer(payload)) throw new Error('Raw webhook body required.');
    const stripeSync = await getStripeSync();
    await stripeSync.processWebhook(payload, signature);
  }
}
