import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useGetCatalog, getGetCatalogQueryKey } from '@workspace/api-client-react';
import type { Product, Bundle, CatalogItem } from '@workspace/brew-catalog';

const CatalogContext = createContext<{
  products: Product[]; bundles: Bundle[]; catalogItems: CatalogItem[];
  loading: boolean; error: boolean; ready: boolean; retry: () => void;
} | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const query = useGetCatalog({
    query: { queryKey: getGetCatalogQueryKey(), staleTime: 15000, refetchInterval: 60000, refetchOnMount: 'always', refetchOnWindowFocus: true, retry: 1 },
    request: { credentials: 'same-origin' },
  });
  const value = useMemo(() => {
    const products = query.data?.products ?? [];
    const bundles = query.data?.bundles ?? [];
    return {
      products, bundles, catalogItems: [...products, ...bundles],
      loading: query.isLoading, error: query.isError && !query.data, ready: Boolean(query.data),
      retry: () => { void query.refetch(); },
    };
  }, [query.data, query.isLoading, query.isError, query.refetch]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('CatalogProvider is required');
  return value;
}
