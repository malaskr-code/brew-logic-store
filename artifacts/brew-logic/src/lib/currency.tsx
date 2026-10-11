import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const currencies = ['KWD', 'USD', 'SAR', 'AED', 'EUR', 'GBP'] as const;
export type Currency = typeof currencies[number];
type Rates = Record<Currency, number>;
type RateCache = { fetchedAt: number; response: { result: 'success'; base_code: 'KWD'; rates: Rates } };

export const RATE_CACHE_KEY = 'brew-currency-rates';
export const CURRENCY_KEY = 'brew-currency';
export const RATE_CACHE_TTL = 24 * 60 * 60 * 1000;
const RATE_URL = 'https://open.er-api.com/v6/latest/KWD';

function readStorage(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Still usable when browser storage is unavailable. */ }
}

function validResponse(value: unknown): value is RateCache['response'] {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<RateCache['response']>;
  return response.result === 'success' && response.base_code === 'KWD' && !!response.rates
    && response.rates.KWD === 1
    && currencies.every(code => typeof response.rates?.[code] === 'number'
      && Number.isFinite(response.rates[code]) && response.rates[code] > 0);
}

function readCache(): RateCache | null {
  try {
    const cache = JSON.parse(readStorage(RATE_CACHE_KEY) || 'null') as RateCache | null;
    if (!cache || !Number.isFinite(cache.fetchedAt) || cache.fetchedAt > Date.now()
      || Date.now() - cache.fetchedAt >= RATE_CACHE_TTL || !validResponse(cache.response)) return null;
    return cache;
  } catch { return null; }
}

// Share an in-flight request, including React's development-mode effect replay.
let pendingRequest: Promise<RateCache> | null = null;
async function loadRates(): Promise<RateCache> {
  const cache = readCache();
  if (cache) return cache;
  if (!pendingRequest) {
    pendingRequest = (async () => {
      const response = await fetch(RATE_URL, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Exchange rates unavailable');
      const payload: unknown = await response.json();
      if (!validResponse(payload)) throw new Error('Invalid exchange rates');
      const fresh = { fetchedAt: Date.now(), response: payload };
      writeStorage(RATE_CACHE_KEY, JSON.stringify(fresh));
      return fresh;
    })().finally(() => { pendingRequest = null; });
  }
  return pendingRequest;
}

export function formatMoney(priceInKwd: number, currency: Currency, rates: Rates | null) {
  const code = rates ? currency : 'KWD';
  return `${(priceInKwd * (rates?.[code] ?? 1)).toFixed(code === 'KWD' ? 3 : 2)} ${code}`;
}

const CurrencyContext = createContext<{
  currency: Currency;
  setCurrency: (value: Currency) => void;
  status: 'loading' | 'ready' | 'error';
  money: (priceInKwd: number) => string;
} | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState(readCache);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => cache ? 'ready' : 'loading');
  const [selected, setSelected] = useState<Currency>(() => {
    const saved = readStorage(CURRENCY_KEY);
    return currencies.includes(saved as Currency) ? saved as Currency : 'KWD';
  });

  useEffect(() => { writeStorage(CURRENCY_KEY, selected); }, [selected]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const fresh = await loadRates();
        if (cancelled) return;
        setCache(fresh);
        setStatus('ready');
        timer = setTimeout(() => { setStatus('loading'); void refresh(); },
          Math.max(1, fresh.fetchedAt + RATE_CACHE_TTL - Date.now()));
      } catch {
        if (cancelled) return;
        setCache(null);
        setSelected('KWD');
        setStatus('error');
      }
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const currency = status === 'ready' ? selected : 'KWD';
  return <CurrencyContext.Provider value={{
    currency, status,
    setCurrency: value => { if (status === 'ready' && currencies.includes(value)) setSelected(value); },
    money: price => formatMoney(price, currency, status === 'ready' ? cache?.response.rates ?? null : null),
  }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('CurrencyProvider is required');
  return context;
}
