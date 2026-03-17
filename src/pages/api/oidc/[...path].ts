/**
 * OIDC provider catch-all route.
 *
 * Handles all oidc-provider built-in endpoints:
 *   GET  /api/oidc/.well-known/openid-configuration
 *   GET  /api/oidc/jwks
 *   GET  /api/oidc/auth
 *   POST /api/oidc/token
 *   GET  /api/oidc/me  (userinfo)
 *   POST /api/oidc/token/introspection
 *   POST /api/oidc/token/revocation
 *
 * IMPORTANT: bodyParser must be disabled — oidc-provider parses request bodies itself.
 *
 * Mount path detection: oidc-provider derives mountPath by comparing req.originalUrl
 * (full path) against req.url (stripped path). We preserve the original URL in
 * req.originalUrl before stripping /api/oidc so oidc-provider can compute
 * mountPath = '/api/oidc' and generate correct endpoint URLs in the discovery document.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getProvider } from '@/app/services/oidc/provider';

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true, // suppress "No response" warning
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const provider = await getProvider();
    // Preserve the full path in originalUrl so oidc-provider can derive
    // mountPath = '/api/oidc' for correct endpoint URL generation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).originalUrl = req.url;
    // Strip the Next.js route prefix so oidc-provider can match its routes
    // (registered at root: /auth, /token, /.well-known/openid-configuration, etc.)
    req.url = req.url?.replace(/^\/api\/oidc/, '') || '/';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return provider.callback()(req as any, res as any);
  } catch (err) {
    console.error('[oidc] Provider error:', err);
    res.status(500).json({ error: 'OIDC provider not configured' });
  }
}
