import type { CatalogItem } from '@workspace/brew-catalog';

export class CheckoutInputError extends Error {}

export function kwdMinorUnits(price: number): number {
  const minor = Math.round(price * 1000);
  // Stripe accepts KWD in fils but requires the last digit to be zero.
  // Never silently round a catalog price or charge a browser-supplied price.
  if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(minor)
    || minor % 10 !== 0 || Math.abs(minor / 1000 - price) > 0.0000001)
    throw new CheckoutInputError('An item has an unsupported checkout price.');
  return minor;
}

export function priceCheckout(
  requested: { id: string; quantity: number }[],
  catalog: CatalogItem[],
) {
  if (!requested.length || requested.length > 50) throw new CheckoutInputError('Invalid cart.');
  const seen = new Set<string>();
  const lines = requested.map(input => {
    if (seen.has(input.id) || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99)
      throw new CheckoutInputError('Invalid cart.');
    seen.add(input.id);
    const item = catalog.find(item => item.id === input.id);
    if (!item) throw new CheckoutInputError('An item is no longer available.');
    return {
      id: item.id, name: item.name, quantity: input.quantity,
      unitAmount: kwdMinorUnits(item.price), kind: 'items' in item ? 'bundle' : 'product',
    };
  });
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);
  if (!Number.isSafeInteger(total) || total < 150 || total > 99999990)
    throw new CheckoutInputError('Cart total is outside the checkout limits.');
  return { lines, total };
}
