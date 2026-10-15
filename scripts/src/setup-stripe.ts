import { initializeStripe, getUncachableStripeClient } from './stripeClient';

async function main() {
  const stripe = await getUncachableStripeClient();
  const balance = await stripe.balance.retrieve();
  if (balance.livemode) throw new Error('Live mode is not permitted.');
  await initializeStripe();
  console.log('Stripe test mode: managed webhook and synchronization ready.');
}

main().then(() => process.exit(0)).catch(() => {
  // No upstream error objects: they may include payment/account information.
  console.error('Stripe test setup failed. Check server-side test credentials, database access, and webhook URL.');
  process.exit(1);
});
