import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateCheckoutBody } from '@workspace/api-zod';
import { kwdMinorUnits, priceCheckout } from './checkout-pricing';
import { getUncachableStripeClient, StripeConfigurationError } from './stripe-client';
import type { CatalogItem } from '@workspace/brew-catalog';

const catalog: CatalogItem[] = [
  { id: 'bean-test', name: 'Test Beans', category: 'bean', price: 3.5, image: 'bag', description: 'Beans', why: 'Brew' },
  { id: 'bundle-test', name: 'Test Bundle', price: 25, regular: 30, items: ['bean-test'], note: 'Set' },
];
test('KWD uses three minor-unit digits without quietly rounding prices', () => {
  assert.equal(kwdMinorUnits(3.5), 3500);
  assert.equal(kwdMinorUnits(199), 199000);
  for (const value of [NaN, Infinity, -1, 0, 3.501, 3.5001]) assert.throws(() => kwdMinorUnits(value));
});
test('both products and bundles are priced only from the server catalog', () => {
  const value = priceCheckout([{ id: 'bean-test', quantity: 2 }, { id: 'bundle-test', quantity: 1 }], catalog);
  assert.equal(value.total, 32000);
  assert.equal(value.lines[1].kind, 'bundle');
});
test('empty, missing, duplicate, fractional, negative and excessive quantities are rejected', () => {
  for (const input of [
    [], [{ id: 'unknown', quantity: 1 }], [{ id: 'bean-test', quantity: 1.5 }],
    [{ id: 'bean-test', quantity: -1 }], [{ id: 'bean-test', quantity: 100 }],
    [{ id: 'bean-test', quantity: 1 }, { id: 'bean-test', quantity: 1 }],
  ]) assert.throws(() => priceCheckout(input, catalog));
});
test('checkout request rejects browser-supplied root prices and invalid quantities', () => {
  const base = { requestId: '6db5da6b-af65-47d0-9c5b-5400754fad77', language: 'en', items: [{ id: 'bean-test', quantity: 1 }] };
  assert.equal(CreateCheckoutBody.strict().safeParse(base).success, true);
  assert.equal(CreateCheckoutBody.strict().safeParse({ ...base, price: 0 }).success, false);
  assert.equal(CreateCheckoutBody.safeParse({ ...base, items: [{ id: 'bean-test', quantity: 0 }] }).success, false);
});
test('a live Stripe key can never enable real checkout in this implementation', async () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_live_not_a_real_key';
    await assert.rejects(getUncachableStripeClient(), StripeConfigurationError);
    delete process.env.STRIPE_SECRET_KEY;
    await assert.rejects(getUncachableStripeClient(), StripeConfigurationError);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});
