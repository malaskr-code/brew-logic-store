import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useGetProducts, useGetBundles, getGetProductsQueryKey, getGetBundlesQueryKey } from '@workspace/api-client-react';
import type { Product, Bundle, CatalogItem } from '@workspace/brew-catalog';

const CatalogContext = createContext<{
  products: Product[]; bundles: Bundle[]; catalogItems: CatalogItem[];
  loading: boolean; error: boolean; ready: boolean; retry: () => void;
} | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const common = { staleTime: 15000, refetchInterval: 60000, refetchOnMount: 'always' as const, refetchOnWindowFocus: true, retry: 1 };
  const productQuery = useGetProducts({
    query: { ...common, queryKey: getGetProductsQueryKey() },
    request: { credentials: 'same-origin' },
  });
  const bundleQuery = useGetBundles({
    query: { ...common, queryKey: getGetBundlesQueryKey() },
    request: { credentials: 'same-origin' },
  });
  const value = useMemo(() => {
    const products = productQuery.data ?? [];
    const bundles = bundleQuery.data ?? [];
    return {
      products, bundles, catalogItems: [...products, ...bundles],
      loading: productQuery.isLoading || bundleQuery.isLoading,
      error: (productQuery.isError && !productQuery.data) || (bundleQuery.isError && !bundleQuery.data),
      ready: Boolean(productQuery.data && bundleQuery.data),
      retry: () => { void productQuery.refetch(); void bundleQuery.refetch(); },
    };
  }, [productQuery.data, bundleQuery.data, productQuery.isLoading, bundleQuery.isLoading, productQuery.isError, bundleQuery.isError, productQuery.refetch, bundleQuery.refetch]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('CatalogProvider is required');
  return value;
}
