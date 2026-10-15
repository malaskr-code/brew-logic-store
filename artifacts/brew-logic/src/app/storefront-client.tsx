'use client';

import dynamic from 'next/dynamic';

// Preferences, cart, favorites and the existing embedded auth UI use browser
// storage. Keep this boundary client-only; Next owns navigation and all APIs.
const Storefront = dynamic(() => import('../App'), { ssr: false });

export default function ClientStorefront() {
  return <Storefront />;
}
