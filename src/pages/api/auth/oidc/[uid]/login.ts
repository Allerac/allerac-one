/**
 * OIDC interaction login handler.
 *
 * Receives the credentials submitted from the interaction page,
 * validates them against allerac-one's user database, and finishes
 * the OIDC interaction so the provider can issue the authorization code.
 *
 * POST /api/auth/oidc/:uid/login
 *   Body: { email: string; password: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';
import { getProvider } from '@/app/services/oidc/provider';
import { AuthService } from '@/app/services/auth/auth.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const { uid } = req.query as { uid: string };
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.redirect(`/auth/oidc/interaction/${uid}?error=missing_credentials`);
    return;
  }

  try {
    const provider = await getProvider();
    const authService = new AuthService();

    // v2 accounts expect a SHA-256 pre-hash (same as client-side login flow)
    const passwordHash = createHash('sha256').update(password).digest('hex');
    const result = await authService.login(email.toLowerCase(), passwordHash);

    if (!result.success) {
      const errorParam = result.needsMigration ? 'needs_migration' : 'invalid_credentials';
      res.redirect(`/auth/oidc/interaction/${uid}?error=${errorParam}`);
      return;
    }

    // Complete the OIDC interaction — provider will issue the authorization code
    // and redirect to the client's redirect_uri.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await provider.interactionFinished(req as any, res as any, {
      login: { accountId: result.user.id },
    }, { mergeWithLastSubmission: false });

  } catch (err) {
    console.error('[oidc login]', err);
    res.redirect(`/auth/oidc/interaction/${uid}?error=server_error`);
  }
}
