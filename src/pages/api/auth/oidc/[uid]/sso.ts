/**
 * OIDC SSO auto-login route.
 *
 * Called when the interaction page detects a valid allerac-one session.
 * Handles both 'login' and 'consent' prompts so the entire OIDC flow
 * completes in one step without requiring any user interaction.
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
    const details = await provider.interactionDetails(req as any, res as any);
    const { prompt, params, session: oidcSession } = details as any;

    if (prompt.name === 'login') {
      // Login + pre-approve consent in one step so the flow doesn't loop back.
      const grant = new provider.Grant({
        accountId: user.id,
        clientId: params.client_id,
      });
      grant.addOIDCScope(params.scope ?? 'openid email profile');
      const grantId = await grant.save();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await provider.interactionFinished(req as any, res as any, {
        login: { accountId: user.id },
        consent: { grantId },
      }, { mergeWithLastSubmission: false });

    } else if (prompt.name === 'consent') {
      // Grant any remaining scopes/claims for the existing session.
      const accountId = oidcSession?.accountId ?? user.id;
      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({ accountId, clientId: params.client_id });

      const { missingOIDCScope, missingOIDCClaims } = prompt.details ?? {};
      if (missingOIDCScope?.length) grant.addOIDCScope(missingOIDCScope.join(' '));
      if (missingOIDCClaims?.length) grant.addOIDCClaims(missingOIDCClaims);

      const grantId = await grant.save();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await provider.interactionFinished(req as any, res as any, {
        consent: { grantId },
      }, { mergeWithLastSubmission: true });

    } else {
      // Unknown prompt — fall back to the login form.
      res.redirect(`/auth/oidc/interaction/${uid}`);
    }

  } catch (err) {
    console.error('[oidc sso]', err);
    res.redirect(`/auth/oidc/interaction/${uid}?error=server_error`);
  }
}
