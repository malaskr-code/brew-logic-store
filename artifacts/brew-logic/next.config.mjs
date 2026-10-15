import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  outputFileTracingRoot: path.resolve(projectRoot, '../..'),
  transpilePackages: [
    '@workspace/api-client-react',
    '@workspace/api-zod',
    '@workspace/brew-catalog',
    '@workspace/brew-server',
  ],
  serverExternalPackages: ['pino', 'pino-pretty', 'mongodb', 'bcryptjs', 'jsonwebtoken'],
  // Only publishable Clerk configuration is exposed to client components.
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '',
    NEXT_PUBLIC_CLERK_PROXY_URL:
      process.env.NEXT_PUBLIC_CLERK_PROXY_URL || process.env.CLERK_PROXY_URL || '',
  },
  // Next's wildcard matches one hostname label, not nested Replit preview hosts.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '*.replit.dev',
    '*.replit.app',
    ...[process.env.REPLIT_DEV_DOMAIN, ...(process.env.REPLIT_DOMAINS || '').split(',')].filter(Boolean),
  ],
  agentRules: false,
};
