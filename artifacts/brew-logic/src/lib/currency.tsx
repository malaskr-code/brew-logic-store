import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getExchangeRates, getVisitorGeo, type VisitorGeo } from '@workspace/api-client-react';

export const currencies = ['KWD', 'USD', 'SAR', 'AED', 'EUR', 'GBP', 'BHD', 'QAR', 'OMR'] as const;
export type Currency = typeof currencies[number];
type Rates = Partial<Record<Currency, number>> & { KWD: number };
type RateCache = { fetchedAt: number; response: { result: 'success'; base_code: 'KWD'; rates: Rates } };

export const RATE_CACHE_KEY = 'brew-currency-rates';
export const CURRENCY_KEY = 'brew-currency';
export const RATE_CACHE_TTL = 24 * 60 * 60 * 1000;
const CURRENCY_SOURCE_KEY = 'brew-currency-source';

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
    && Object.values(response.rates).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
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
      const payload: unknown = await getExchangeRates({ signal: AbortSignal.timeout(12000) });
      if (!validResponse(payload)) throw new Error('Invalid exchange rates');
      const fresh = { fetchedAt: Date.now(), response: payload };
      writeStorage(RATE_CACHE_KEY, JSON.stringify(fresh));
      return fresh;
    })().finally(() => { pendingRequest = null; });
  }
  return pendingRequest;
}

export function formatMoney(priceInKwd: number, currency: Currency, rates: Rates | null) {
  const code = rates?.[currency] ? currency : 'KWD';
  return `${(priceInKwd * (rates?.[code] ?? 1)).toFixed(code === 'KWD' ? 3 : 2)} ${code}`;
}

const CurrencyContext = createContext<{
  currency: Currency;
  setCurrency: (value: Currency) => void;
  status: 'loading' | 'ready' | 'error';
  money: (priceInKwd: number) => string;
  fromLocation: boolean;
  availableCurrencies: readonly Currency[];
} | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    const saved = readStorage(CURRENCY_KEY);
    const savedCurrency = currencies.includes(saved as Currency) ? saved as Currency : null;
    const testip = new URLSearchParams(window.location.search).get('testip');
    return { savedCurrency, testip, shouldLocate: testip !== null || savedCurrency === null };
  });
  const [cache, setCache] = useState(readCache);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => cache ? 'ready' : 'loading');
  const [selected, setSelected] = useState<Currency>(() => initial.testip !== null ? 'KWD' : initial.savedCurrency ?? 'KWD');
  const [fromLocation, setFromLocation] = useState(() => initial.testip === null && !!initial.savedCurrency && readStorage(CURRENCY_SOURCE_KEY) === 'location');
  const [location, setLocation] = useState<VisitorGeo | null>(null);
  const manuallySelected = useRef(false);
  const locationApplied = useRef(false);

  useEffect(() => {
    if (!initial.shouldLocate) return;
    let cancelled = false;
    getVisitorGeo(initial.testip !== null ? { testip: initial.testip } : undefined, { signal: AbortSignal.timeout(10000) })
      .then(value => { if (!cancelled) setLocation(value); })
      .catch(() => { if (!cancelled) setLocation({ countryCode: null, currency: null }); });
    return () => { cancelled = true; };
  }, [initial]);

  useEffect(() => {
    if (!location || status === 'loading' || locationApplied.current || manuallySelected.current) return;
    locationApplied.current = true;
    const code = location.currency as Currency;
    const supported = status === 'ready' && currencies.includes(code) && !!cache?.response.rates[code];
    const next = supported ? code : 'KWD';
    setSelected(next);
    setFromLocation(supported);
    // A test location is temporary; never replace the saved real-world choice.
    if (initial.testip === null) {
      writeStorage(CURRENCY_KEY, next);
      writeStorage(CURRENCY_SOURCE_KEY, supported ? 'location' : 'default');
    }
  }, [location, status, cache, initial]);
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
        setFromLocation(false);
        setStatus('error');
      }
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const availableCurrencies = currencies.filter(code => !!cache?.response.rates[code]);
  const currency = status === 'ready' && availableCurrencies.includes(selected) ? selected : 'KWD';
  return <CurrencyContext.Provider value={{
    currency, status, availableCurrencies,
    fromLocation: fromLocation && status === 'ready' && currency === selected,
    setCurrency: value => {
      if (status !== 'ready' || !availableCurrencies.includes(value)) return;
      manuallySelected.current = true;
      setSelected(value);
      setFromLocation(false);
      writeStorage(CURRENCY_KEY, value);
      writeStorage(CURRENCY_SOURCE_KEY, 'manual');
    },
    money: price => formatMoney(price, currency, status === 'ready' ? cache?.response.rates ?? null : null),
  }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('CurrencyProvider is required');
  return context;
}
