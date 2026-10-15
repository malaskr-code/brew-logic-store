import type { CatalogItem } from '@workspace/brew-catalog';

export class CheckoutInputError extends Error {}

export function kwdMinorUnits(price: number): number {
  const minor = Math.round(price * 1000);
  // Catalog prices remain KWD with three decimals, independent of USD checkout.
  if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(minor)
    || Math.abs(minor / 1000 - price) > 0.0000001)
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

export function convertCheckoutToUsd(priced: ReturnType<typeof priceCheckout>, rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new CheckoutInputError('Invalid exchange rate.');
  const lines = priced.lines.map(line => ({ ...line, usdUnitAmount: Math.round(line.unitAmount / 1000 * rate * 100) }));
  const total = lines.reduce((sum, line) => sum + line.usdUnitAmount * line.quantity, 0);
  if (lines.some(line => line.usdUnitAmount <= 0 || !Number.isSafeInteger(line.usdUnitAmount))
    || !Number.isSafeInteger(total) || total < 50 || total > 99999999)
    throw new CheckoutInputError('USD total is outside checkout limits.');
  return { lines, total };
}
