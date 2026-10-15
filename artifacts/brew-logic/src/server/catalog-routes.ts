import 'server-only';
import { createClerkClient } from '@clerk/backend';
import { publishableKeyFromHost } from '@clerk/shared/keys';
import { NextResponse, type NextRequest } from 'next/server';
import {
  GetCatalogResponse, GetAdminCatalogResponse, CreateCatalogEntryBody, CreateCatalogEntryResponse,
  UpdateCatalogEntryBody, UpdateCatalogEntryParams, UpdateCatalogEntryResponse, DeleteCatalogEntryParams,
} from '@workspace/api-zod';
import {
  getCatalog, getProducts, getBundles, createCatalogEntry, updateCatalogEntry, deleteCatalogEntry,
  CatalogInputError, CatalogConflictError,
} from '@workspace/brew-server/catalog-service';
import { logger } from '@workspace/brew-server/logger';
import { json, readJson, requestHost, sameOrigin } from './http';

async function adminGuard(request: NextRequest) {
  if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: 'Cross-site changes are not allowed.' }, 403);
  try {
    const client = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: publishableKeyFromHost(requestHost(request), process.env.CLERK_PUBLISHABLE_KEY),
    });
    const state = await client.authenticateRequest(request, { acceptsToken: 'session_token' });
    if (!state.isSignedIn) return json({ error: 'Sign in to manage the catalog.' }, 401);
    const userId = state.toAuth().userId;
    if (!userId) return json({ error: 'Sign in to manage the catalog.' }, 401);
    const owner = process.env.BREW_LOGIC_ADMIN_EMAIL?.trim().toLowerCase();
    if (!owner) return json({ error: 'Administrator access is not configured.' }, 503);
    const user = await client.users.getUser(userId);
    if (!user.emailAddresses.some(email => email.emailAddress.toLowerCase() === owner && email.verification?.status === 'verified'))
      return json({ error: 'This account is not permitted to manage the catalog.' }, 403);
    return null;
  } catch {
    logger.warn('Administrator identity verification failed');
    return json({ error: 'Administrator access could not be verified. Please try again.' }, 503);
  }
}

export async function catalogRoute(request: NextRequest, path: string) {
  if (path.startsWith('admin/')) {
    const denied = await adminGuard(request);
    if (denied) return denied;
  }
  // Parse before the service catch so malformed JSON keeps the shared 400/413 response.
  const body = ['POST', 'PUT'].includes(request.method) ? await readJson(request) : undefined;
  try {
    if (path === 'products') return json(await getProducts());
    if (path === 'bundles') return json(await getBundles());
    if (path === 'catalog') return json(GetCatalogResponse.parse(await getCatalog()));
    if (path === 'admin/catalog' && ['GET', 'HEAD'].includes(request.method)) return json(GetAdminCatalogResponse.parse(await getCatalog()));
    if (request.method === 'POST') {
      const parsed = CreateCatalogEntryBody.safeParse(body);
      if (!parsed.success) return json({ error: 'Check the catalog fields and prices.' }, 400);
      return json(CreateCatalogEntryResponse.parse(await createCatalogEntry(parsed.data)), 201);
    }
    const id = decodeURIComponent(path.slice('admin/catalog/'.length));
    if (request.method === 'PUT') {
      const params = UpdateCatalogEntryParams.safeParse({ id });
      const parsed = UpdateCatalogEntryBody.safeParse(body);
      if (!params.success || !parsed.success) return json({ error: 'Check the catalog fields and prices.' }, 400);
      const result = await updateCatalogEntry(params.data.id, parsed.data);
      return result ? json(UpdateCatalogEntryResponse.parse(result)) : json({ error: 'Catalog entry not found.' }, 404);
    }
    const params = DeleteCatalogEntryParams.safeParse({ id });
    if (!params.success) return json({ error: 'Invalid catalog identifier.' }, 400);
    return await deleteCatalogEntry(params.data.id)
      ? new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
      : json({ error: 'Catalog entry not found.' }, 404);
  } catch (error) {
    if (error instanceof CatalogInputError) return json({ error: error.message }, 400);
    if (error instanceof CatalogConflictError) return json({ error: error.message }, 409);
    logger.error('MongoDB catalog operation failed');
    return json({ error: 'The catalog is unavailable. Please try again.' }, 503);
  }
}
