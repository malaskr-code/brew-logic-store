import 'server-only';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { SendChatMessageBody, SendChatMessageResponse } from '@workspace/api-zod';
import { askGroq, BUSY_REPLY, ChatRateLimitError, VisitorChatLimiter } from '@workspace/brew-server/chat-service';
import { getCatalog } from '@workspace/brew-server/catalog-service';
import { logger } from '@workspace/brew-server/logger';
import { json, readJson } from './http';

const limiter = new VisitorChatLimiter();
const signingKey = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const sign = (id: string) => createHmac('sha256', signingKey).update(id).digest('base64url');

function visitorId(token?: string) {
  const [id, supplied] = token?.split('.') ?? [];
  if (!id || !/^[a-f0-9-]{36}$/.test(id) || !supplied) return null;
  const expected = Buffer.from(sign(id)), actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : null;
}

export async function chatRoute(request: NextRequest) {
  let visitor = visitorId(request.cookies.get('brew_chat_visitor')?.value);
  const isNew = !visitor;
  visitor ||= randomUUID();
  const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
    const response = json(SendChatMessageResponse.parse(body), status, headers);
    if (isNew) response.cookies.set('brew_chat_visitor', `${visitor}.${sign(visitor!)}`, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/chat',
    });
    return response;
  };
  if (!limiter.allow(visitor)) return reply({ reply: BUSY_REPLY, error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  const parsed = SendChatMessageBody.safeParse(await readJson(request));
  if (!parsed.success || parsed.data.messages.some(message => !message.content.trim()) || parsed.data.messages.at(-1)?.role !== 'user')
    return reply({ reply: 'Send a message of 1–500 characters with at most 6 history messages.', error: 'invalid_message' }, 400);
  const key = process.env.GROQ_API_KEY, model = process.env.GROQ_MODEL;
  if (!key || !model) return reply({ reply: 'The assistant is unavailable right now. Please try again later.', error: 'unavailable' }, 503);
  try { return reply({ reply: await askGroq(parsed.data.messages, { key, model }, await getCatalog()) }); }
  catch (error) {
    if (error instanceof ChatRateLimitError) return reply({ reply: BUSY_REPLY, error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    logger.warn('Chat provider request failed');
    return reply({ reply: 'The assistant is unavailable right now. Please try again later.', error: 'unavailable' }, 503);
  }
}
