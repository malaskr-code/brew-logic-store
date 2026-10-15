'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
export { default as Link } from 'next/link';

export function useLocation(): [string, (href: string, options?: { replace?: boolean }) => void] {
  const path = usePathname() || '/';
  const router = useRouter();
  const navigate = useCallback((href: string, options?: { replace?: boolean }) => {
    if (options?.replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [router]);
  return [path, navigate];
}
