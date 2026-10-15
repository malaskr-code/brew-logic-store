import 'server-only';
import { isIP } from 'node:net';
import { NextResponse, type NextRequest } from 'next/server';
import { SignupCustomerBody, LoginCustomerBody, SignupCustomerResponse, LoginCustomerResponse, GetCustomerSessionResponse } from '@workspace/api-zod';
import {
  signupCustomer, loginCustomer, getCustomerSession, CUSTOMER_COOKIE, SESSION_DURATION,
  customerCookieOptions, EmailInUseError, InvalidCredentialsError, AuthAttemptLimiter,
  CustomerAuthConfigurationError,
} from '@workspace/brew-server/customer-auth';
import { logger } from '@workspace/brew-server/logger';
import { json, readJson, sameOrigin } from './http';

const limiter = new AuthAttemptLimiter();
const invalidLogin = () => json({ error: 'Email or password is incorrect', code: 'invalid_credentials' }, 401);
const limited = (signup = false) => json({
  error: signup ? 'Too many attempts. Please try again later.' : 'Too many attempts. Please try again in a minute.',
  code: 'rate_limited',
}, 429);

function clearCookie(response: ReturnType<typeof json>) {
  response.cookies.set(CUSTOMER_COOKIE, '', { ...customerCookieOptions, maxAge: 0, expires: new Date(0) });
  return response;
}

function authError(error: unknown) {
  if (error instanceof EmailInUseError) return json({ error: 'This email is already in use.', code: 'email_in_use' }, 409);
  if (error instanceof InvalidCredentialsError) return invalidLogin();
  if (error instanceof CustomerAuthConfigurationError) logger.warn({ reason: error.reason }, 'JWT signing configuration unavailable');
  else logger.warn('Customer account operation unavailable');
  return json({ error: 'Accounts are temporarily unavailable. Please try again.', code: 'unavailable' }, 503);
}

export async function customerRoute(request: NextRequest, action: string) {
  const token = request.cookies.get(CUSTOMER_COOKIE)?.value;
  if (action === 'me') {
    try {
      const user = await getCustomerSession(token);
      const response = json(GetCustomerSessionResponse.parse({ user }));
      return !user && token ? clearCookie(response) : response;
    } catch (error) { return authError(error); }
  }
  if (!sameOrigin(request)) return json({ error: 'Cross-site account requests are not allowed.', code: 'cross_site' }, 403);
  if (action === 'logout') return clearCookie(new NextResponse(null, {
    status: 204, headers: { 'Cache-Control': 'no-store' },
  }));
  const firstIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const ip = firstIp && isIP(firstIp) ? firstIp : 'unknown';
  if (action === 'signup' && !limiter.allow(`signup:${ip}`, 10, 60 * 60 * 1000)) return limited(true);
  const raw = await readJson(request);
  const body = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...raw, email: typeof (raw as { email?: unknown }).email === 'string'
      ? (raw as { email: string }).email.trim().toLowerCase() : (raw as { email?: unknown }).email }
    : raw;
  if (action === 'signup') {
    const parsed = SignupCustomerBody.safeParse(body);
    if (!parsed.success || !parsed.data.name.trim() || Array.from(parsed.data.password).length < 8 || Buffer.byteLength(parsed.data.password) > 72)
      return json({ error: 'Enter a name, valid email, and password of at least 8 characters (maximum 72 bytes).', code: 'validation' }, 400);
    try {
      const session = await signupCustomer(parsed.data);
      const response = json(SignupCustomerResponse.parse({ user: session.user }), 201);
      response.cookies.set(CUSTOMER_COOKIE, session.token, { ...customerCookieOptions, maxAge: SESSION_DURATION / 1000 });
      return response;
    } catch (error) { return authError(error); }
  }
  if (!limiter.allow(`login:${ip}`, 10, 60 * 1000)) return limited();
  const parsed = LoginCustomerBody.safeParse(body);
  if (!parsed.success || Array.from(parsed.data.password).length < 8 || Buffer.byteLength(parsed.data.password) > 72) return invalidLogin();
  if (!limiter.allow(`email:${parsed.data.email}`, 20, 60 * 1000)) return limited();
  try {
    const session = await loginCustomer(parsed.data);
    const response = json(LoginCustomerResponse.parse({ user: session.user }));
    response.cookies.set(CUSTOMER_COOKIE, session.token, { ...customerCookieOptions, maxAge: SESSION_DURATION / 1000 });
    return response;
  } catch (error) { return authError(error); }
}
