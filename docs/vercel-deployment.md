# Deploy Brew Logic on Vercel

## Import settings

- Project name: `brew-logic-store` (or another available name).
- Root directory: `./` (the repository root).
- Application preset: **Services**.
- Keep access to files outside each service root enabled if Vercel offers that
  setting: the services import shared packages from `lib/`, and the storefront
  uses files from `attached_assets/`.
- Do not import the individual apps as separate projects.

The root `vercel.json` defines only the production storefront and API.
`artifacts/mockup-sandbox` is not a deployment service.

## Build and routing

- Both services install the workspace with the pinned pnpm version and frozen
  lockfile.
- The storefront runs its existing Vite build with `BASE_PATH=/` and `PORT=3000`.
  These are build configuration values, not a public backend URL. Its static
  output is `artifacts/brew-logic/dist/public`.
- The API uses Vercel's Express support with the existing default-exported app
  at `artifacts/api-server/src/app.ts`. Its normal Replit listener and esbuild
  start scripts are not run on Vercel.
- `/api` and `/api/*`, including `/api/__clerk/*`, route to the API without
  stripping the `/api` prefix.
- Other paths route to the storefront. Its SPA fallback serves `index.html` for
  deep links such as product details, `/machines`, `/beans`, and `/login`.
- Both services share one origin, preserving the customer's secure, httpOnly
  JWT cookie and existing relative API URLs.

## Environment variables

Configure values securely in Vercel's Environment Variables settings. Do not
commit an `.env` file or put secret values in `vercel.json`.

| Variable | Used by |
| --- | --- |
| `MONGODB_URI` | API catalog and customer accounts |
| `JWT_SECRET` | API customer sessions; at least 32 bytes |
| `SESSION_SECRET` | API chatbot visitor identification |
| `GROQ_API_KEY` | API chatbot |
| `GROQ_MODEL` | API chatbot model selection |
| `GEO_API_URL` | API location lookup |
| `BREW_LOGIC_ADMIN_EMAIL` | API owner authorization |
| `CLERK_SECRET_KEY` | API owner authentication |
| `CLERK_PUBLISHABLE_KEY` | API owner authentication |
| `VITE_CLERK_PUBLISHABLE_KEY` | Storefront owner authentication; public key only |

Only publishable configuration belongs in a `VITE_` variable. Never prefix
MongoDB, JWT, Groq, session, or Clerk secret keys with `VITE_`.

Set variables for each Vercel environment you intend to use. Preview deployments
should use isolated test data and credentials rather than the live store's
database. Redeploy after changing build-time frontend variables.

The project currently uses **Replit-managed Clerk** for the private owner
editor, separately from MongoDB/JWT customer accounts. This configuration does
not migrate that tenant or change its keys, domains, or proxy settings. Confirm
that the Clerk instance supports the Vercel production domain before relying on
owner sign-in there; do not assume Replit's managed production setup transfers
automatically. Do not copy a Replit preview-specific `VITE_CLERK_PROXY_URL` into
Vercel. Configure a proxy URL only if it is supported and configured for the
chosen Clerk tenant and deployment domain.

Allow the Vercel backend to connect through the MongoDB provider's network access
controls. No database migration or automatic seed is performed during deployment.
Use the existing catalog database, or explicitly seed a separate empty database
with the project's one-time catalog seed command.

## Before launch

1. Ensure this configuration and the latest application code are on the GitHub
   branch Vercel imports.
2. Import or refresh the project with the settings above and add the required
   environment variables.
3. Inspect both service build logs.
4. Verify `/api/healthz`, `/api/products`, and `/api/bundles`.
5. Open a product detail URL directly and refresh it.
6. Verify guest shopping, customer login/logout, chatbot, currency lookup, and
   owner access on the actual HTTPS deployment.

In-memory request limits and rate caches are per running API instance; this
configuration does not replace them with shared storage.

References:
- https://vercel.com/docs/services
- https://vercel.com/docs/services/config-reference
- https://vercel.com/docs/services/routing
- https://vercel.com/docs/frameworks/backend/express
- https://vercel.com/docs/frameworks/frontend/vite
