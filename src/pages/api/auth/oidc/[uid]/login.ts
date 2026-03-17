/**
 * OIDC interaction login handler.
 *
 * Receives the credentials submitted from the interaction page,
 * validates them against allerac-one's user database, and finishes
 * the OIDC interaction so the provider can issue the authorization code.
 *
 * Also auto-grants consent for first-party clients so the flow never
 * loops back to the interaction page for a consent prompt.
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

    // Get interaction details to read client_id and requested scopes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = await provider.interactionDetails(req as any, res as any);
    const { params } = details as any;

    // Auto-grant consent for first-party clients so the flow does not loop
    // back to this page for a consent prompt.
    const grant = new provider.Grant({
      accountId: result.user.id,
      clientId: params.client_id,
    });
    grant.addOIDCScope(params.scope ?? 'openid email profile');
    const grantId = await grant.save();

    // Complete the OIDC interaction — provider will issue the authorization code
    // and redirect to the client's redirect_uri.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await provider.interactionFinished(req as any, res as any, {
      login: { accountId: result.user.id },
      consent: { grantId },
    }, { mergeWithLastSubmission: false });

  } catch (err) {
    console.error('[oidc login]', err);
    res.redirect(`/auth/oidc/interaction/${uid}?error=server_error`);
  }
}
