'use client';

import { useEffect, useRef, useState } from 'react';
import { createCheckoutQuote, createCheckout, getCheckoutSession, type CheckoutStatus, type CheckoutQuote } from '@workspace/api-client-react';

const messages = {
  en: {
    opening: 'Opening Stripe…', quoting: 'Calculating USD total…', verifying: 'Verifying your test payment…',
    confirm: 'Pay {amount} USD (test)', quoteLabel: 'Stripe test payment',
    rateLabel: 'Catalog total: {kwd} KWD · 1 KWD = {rate} USD. This quote is valid for 15 minutes.',
    paid: 'Test payment confirmed. Thank you! No real money was charged.',
    cancelled: 'Checkout cancelled. Your cart is unchanged.',
    pending: 'Payment is not confirmed yet. Your cart is unchanged.',
    expired: 'This checkout expired. Your cart is unchanged.',
    error: 'Test checkout is unavailable. Your cart is unchanged. Please try again.',
    retry: 'Check payment again',
  },
  ar: {
    opening: 'جارٍ فتح Stripe…', quoting: 'جارٍ حساب الإجمالي بالدولار…', verifying: 'جارٍ التحقق من دفعتك التجريبية…',
    confirm: 'دفع {amount} USD (تجريبي)', quoteLabel: 'الدفع التجريبي عبر Stripe',
    rateLabel: 'إجمالي المتجر: {kwd} KWD · ‏1 KWD = {rate} USD. هذا السعر صالح لمدة 15 دقيقة.',
    paid: 'تم تأكيد الدفع التجريبي. شكرًا لك! لم يتم تحصيل أي مبلغ حقيقي.',
    cancelled: 'تم إلغاء إتمام الطلب. لم تتغير سلتك.',
    pending: 'لم يتم تأكيد الدفع بعد. لم تتغير سلتك.',
    expired: 'انتهت صلاحية جلسة الدفع. لم تتغير سلتك.',
    error: 'الدفع التجريبي غير متاح حاليًا. لم تتغير سلتك. حاول مرة أخرى.',
    retry: 'التحقق من الدفع مجددًا',
  },
};

export function useCheckout(
  items: { id: string; quantity: number }[],
  language: 'en' | 'ar',
  onPaid: (receipt: CheckoutStatus) => void,
) {
  const [busy, setBusy] = useState<'opening' | 'quoting' | 'verifying' | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const quoteFingerprint = useRef('');
  const fingerprint = JSON.stringify({ items: items.map(({ id, quantity }) => ({ id, quantity })), language });
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;
  const [status, setStatus] = useState<'paid' | 'cancelled' | 'pending' | 'expired' | 'error' | null>(null);
  const [returned] = useState(() => new URLSearchParams(window.location.search).has('checkout'));
  const session = useRef<string | null>(null);
  const paidCallback = useRef(onPaid);
  paidCallback.current = onPaid;
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const active = useRef(false);
  const t = messages[language];
  useEffect(() => { setQuote(null); request.current = null; }, [fingerprint]);

  function removeReturnQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout');
    url.searchParams.delete('session_id');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }

  async function verify() {
    if (active.current || !session.current) return;
    active.current = true;
    setBusy('verifying');
    try {
      const result = await getCheckoutSession({ session_id: session.current }, { credentials: 'include' });
      if (result.status === 'paid') {
        paidCallback.current(result);
        removeReturnQuery();
      }
      setStatus(result.status);
    } catch { setStatus('error'); }
    finally { active.current = false; setBusy(null); }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('checkout') === 'cancelled') { setStatus('cancelled'); removeReturnQuery(); }
    else if (query.get('checkout') === 'success') {
      const id = query.get('session_id');
      if (!id || !/^cs_test_[A-Za-z0-9]{1,240}$/.test(id)) setStatus('error');
      else { session.current = id; void verify(); }
    }
  }, []);

  async function start() {
    if (active.current || !items.length) return;
    active.current = true;
    const confirmedQuote = quote && quoteFingerprint.current === fingerprint
      && new Date(quote.expiresAt).getTime() > Date.now() ? quote : null;
    setBusy(confirmedQuote ? 'opening' : 'quoting');
    setStatus(null);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      if (!confirmedQuote) {
        const result = await createCheckoutQuote({
          items: items.map(({ id, quantity }) => ({ id, quantity })),
          requestId: request.current!.id, language,
        }, { credentials: 'include' });
        if (currentFingerprint.current === fingerprint) {
          quoteFingerprint.current = fingerprint;
          setQuote(result);
        }
        active.current = false;
        setBusy(null);
        return;
      }
      const result = await createCheckout({ quoteId: confirmedQuote.quoteId }, { credentials: 'include' });
      const target = new URL(result.url);
      if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') throw new Error('Invalid checkout.');
      window.location.assign(target.toString());
    } catch { setStatus('error'); setQuote(null); request.current = null; active.current = false; setBusy(null); }
  }

  return {
    start, verify, returned,
    busy: Boolean(busy) || Boolean(session.current && (status === 'pending' || status === 'error')),
    quote, quoteLabel: t.quoteLabel,
    rateLabel: quote ? t.rateLabel.replace('{kwd}', quote.amountKwd.toFixed(3)).replace('{rate}', quote.rate.toFixed(6)) : null,
    buttonText: busy === 'opening' ? t.opening : busy === 'quoting' ? t.quoting
      : quote ? t.confirm.replace('{amount}', quote.amountUsd.toFixed(2)) : null,
    message: busy === 'verifying' ? t.verifying : status ? t[status] : null,
    isError: status === 'error', retryText: t.retry,
    canRetry: Boolean(session.current) && !busy && (status === 'pending' || status === 'error'),
  };
}

export type CheckoutState = ReturnType<typeof useCheckout>;
