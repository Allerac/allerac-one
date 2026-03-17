/**
 * OIDC SSO auto-login route.
 *
 * Called when the interaction page detects a valid allerac-one session.
 * Runs interactionFinished here (an API route) instead of getServerSideProps
 * so oidc-provider has full, uncontested control of the response.
 *
 * GET /api/auth/oidc/:uid/sso
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getProvider } from '@/app/services/oidc/provider';
import { AuthService } from '@/app/services/auth/auth.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { uid } = req.query as { uid: string };
  const sessionToken = req.cookies?.session_token;

  if (!sessionToken) {
    res.redirect(`/auth/oidc/interaction/${uid}`);
    return;
  }

  try {
    const provider = await getProvider();
    const authService = new AuthService();
    const user = await authService.validateSession(sessionToken);

    if (!user) {
      res.redirect(`/auth/oidc/interaction/${uid}`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await provider.interactionFinished(req as any, res as any, {
      login: { accountId: user.id },
    }, { mergeWithLastSubmission: false });

  } catch (err) {
    console.error('[oidc sso]', err);
    res.redirect(`/auth/oidc/interaction/${uid}?error=server_error`);
  }
}
