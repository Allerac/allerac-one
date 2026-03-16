/**
 * OIDC Interaction page — login/consent for the authorization_code flow.
 *
 * Flow:
 *  1. oidc-provider redirects here after a client starts an auth request.
 *  2. getServerSideProps reads the session_token cookie.
 *     - Valid session → auto-completes the interaction (true SSO, no form shown).
 *     - No session   → renders the login form below.
 *  3. Form submits to POST /api/auth/oidc/:uid/login.
 *  4. Login handler validates credentials and calls interactionFinished,
 *     which redirects back to the provider to issue the authorization code.
 */

import type { GetServerSideProps } from 'next';
import { useState, FormEvent } from 'react';
import { getProvider } from '@/app/services/oidc/provider';
import { AuthService } from '@/app/services/auth/auth.service';

interface Props {
  uid?: string;
  clientId?: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  missing_credentials: 'Please enter your email and password.',
  needs_migration: 'Your account needs a password reset. Please log in to chat.allerac.ai first.',
  server_error: 'An unexpected error occurred. Please try again.',
};

export default function InteractionPage({ uid, clientId, error }: Props) {
  const [loading, setLoading] = useState(false);

  // uid is only undefined when auto-SSO completed (response already sent)
  if (!uid) return null;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    setLoading(true);
    // Native form submit — lets the browser POST and follow the redirect chain
    void e;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Allerac
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sign in to continue to{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {clientId ?? 'the app'}
            </span>
          </p>
        </div>

        {/* Error banner */}
        {error && ERROR_MESSAGES[error] && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-700 dark:text-red-400">
              {ERROR_MESSAGES[error]}
            </p>
          </div>
        )}

        {/* Login form */}
        <form
          method="POST"
          action={`/api/auth/oidc/${uid}/login`}
          onSubmit={handleSubmit}
          className="space-y-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-600">
          Your credentials are sent only to chat.allerac.ai
        </p>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params, query }) => {
  const uid = params?.uid as string | undefined;
  if (!uid) return { notFound: true };

  try {
    const provider = await getProvider();
    const interactionDetails = await provider.interactionDetails(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res as any,
    );

    // SSO shortcut: if the user is already logged into allerac-one,
    // complete the interaction silently — no login form is shown.
    const sessionToken = req.cookies?.session_token;
    if (sessionToken) {
      const authService = new AuthService();
      const user = await authService.validateSession(sessionToken);
      if (user) {
        await provider.interactionFinished(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          req as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res as any,
          { login: { accountId: user.id } },
          { mergeWithLastSubmission: false },
        );
        // Response already sent (redirect). Return empty props — page won't render.
        return { props: {} };
      }
    }

    const clientId = interactionDetails.params?.client_id as string | undefined;
    const error = query.error as string | undefined;

    return { props: { uid, clientId, error } };
  } catch (err) {
    console.error('[oidc interaction page]', err);
    return { notFound: true };
  }
};
