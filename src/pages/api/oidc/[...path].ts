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
 * IMPORTANT: do NOT strip the /api/oidc prefix from req.url — oidc-provider uses the
 * issuer URL pathname as its mount path and needs the full path for correct routing
 * and for generating correct endpoint URLs in the discovery document.
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
    // Do NOT strip the /api/oidc prefix — oidc-provider derives its mount path
    // from the issuer URL pathname (/api/oidc) and uses it for both routing
    // and generating correct endpoint URLs in the discovery document.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return provider.callback()(req as any, res as any);
  } catch (err) {
    console.error('[oidc] Provider error:', err);
    res.status(500).json({ error: 'OIDC provider not configured' });
  }
}
