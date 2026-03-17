/**
 * OIDC Provider singleton for allerac-one.
 *
 * Turns chat.allerac.ai into a standards-compliant OIDC Authorization Server.
 * Other systems (allerac-health, allerac-crawler, future apps) authenticate
 * users via this provider using standard OIDC/OAuth2 flows.
 *
 * Required environment variables:
 *   OIDC_ISSUER              Base URL of the OIDC endpoints (e.g. https://chat.allerac.ai/api/oidc)
 *   OIDC_JWKS_JSON           RS256 keypair as a JWK Set JSON string
 *   OIDC_COOKIE_SECRET       Secret for signing OIDC interaction session cookies
 *   OIDC_CLIENT_SECRET_HEALTH  Client secret for allerac-health
 *
 * Optional:
 *   OIDC_CLIENT_SECRET_CRAWLER  Client secret for allerac-crawler (machine-to-machine)
 *
 * Generate OIDC_JWKS_JSON:
 *   node -e "
 *     const {generateKeyPairSync} = require('crypto');
 *     const {privateKey} = generateKeyPairSync('rsa', {modulusLength:2048});
 *     const k = privateKey.export({format:'jwk'});
 *     k.use='sig'; k.alg='RS256';
 *     k.kid='allerac-1';
 *     console.log(JSON.stringify({keys:[k]}));
 *   "
 *
 * Generate OIDC_COOKIE_SECRET:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import pool from '@/app/clients/db';
import { PostgreSQLAdapter } from './postgresql-adapter';

// oidc-provider is an ESM-only package. It is listed in serverExternalPackages
// in next.config.ts so Next.js does not try to bundle it.
// The dynamic import is used to maintain compatibility with the TypeScript
// compilation pipeline while respecting the ESM boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _provider: any = null;

export async function getProvider() {
  if (_provider) return _provider;

  const { default: Provider } = await import('oidc-provider');

  const issuer = process.env.OIDC_ISSUER;
  if (!issuer) throw new Error('OIDC_ISSUER environment variable is not set');

  const jwksJson = process.env.OIDC_JWKS_JSON;
  if (!jwksJson) throw new Error('OIDC_JWKS_JSON environment variable is not set');

  const cookieSecret = process.env.OIDC_COOKIE_SECRET;
  if (!cookieSecret) throw new Error('OIDC_COOKIE_SECRET environment variable is not set');

  const healthSecret = process.env.OIDC_CLIENT_SECRET_HEALTH;
  if (!healthSecret) throw new Error('OIDC_CLIENT_SECRET_HEALTH environment variable is not set');

  const jwks = JSON.parse(jwksJson);

  // Registered OIDC clients.
  // allerac-health: authorization_code flow (user-facing web app)
  // allerac-crawler: client_credentials flow (machine-to-machine, no user)
  const clients = [
    {
      client_id: 'allerac-health',
      client_secret: healthSecret,
      redirect_uris: [
        process.env.HEALTH_REDIRECT_URI || 'https://health.allerac.ai/api/auth/callback/allerac-one',
      ],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid email profile',
      token_endpoint_auth_method: 'client_secret_basic',
    },
  ];

  const crawlerSecret = process.env.OIDC_CLIENT_SECRET_CRAWLER;
  if (crawlerSecret) {
    clients.push({
      client_id: 'allerac-crawler',
      client_secret: crawlerSecret,
      redirect_uris: [],
      grant_types: ['client_credentials'],
      response_types: [],
      scope: 'openid',
      token_endpoint_auth_method: 'client_secret_basic',
    });
  }

  _provider = new Provider(issuer, {
    adapter: PostgreSQLAdapter,

    jwks,

    clients,

    // Map OIDC claims to scopes
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name'],
    },

    // Resolve a user account from the `sub` claim (user UUID from allerac-one)
    async findAccount(_ctx: unknown, sub: string) {
      const { rows } = await pool.query(
        'SELECT id, email, name FROM users WHERE id = $1',
        [sub],
      );
      const user = rows[0];
      if (!user) return undefined;

      return {
        accountId: sub,
        async claims(_use: string, _scope: string) {
          return {
            sub,
            email: user.email,
            email_verified: true,
            name: user.name ?? undefined,
          };
        },
      };
    },

    // Where to redirect the browser for login / consent
    interactions: {
      url(_ctx: unknown, interaction: { uid: string }) {
        return `/auth/oidc/interaction/${interaction.uid}`;
      },
    },

    // Token TTLs
    ttl: {
      AccessToken: 3600,        // 1 hour
      AuthorizationCode: 300,   // 5 minutes
      IdToken: 3600,            // 1 hour
      RefreshToken: 2592000,    // 30 days
      Session: 604800,          // 7 days (matches allerac-one session expiry)
      Interaction: 3600,        // 1 hour
      Grant: 2592000,           // 30 days
    },

    cookies: {
      keys: [cookieSecret],
    },

    features: {
      introspection: { enabled: true },
      revocation: { enabled: true },
      userinfo: { enabled: true },
      devInteractions: { enabled: false },
      rpInitiatedLogout: { enabled: false },
    },

    pkce: {
      required: () => false,
      methods: ['S256'],
    },
  });

  // proxy: true is NOT read from the config object by the Provider constructor —
  // it must be set directly on the instance after construction.
  // This tells oidc-provider's internal Koa app to trust x-forwarded-proto/host
  // headers from Cloudflare so endpoint URLs use https.
  _provider.proxy = true;

  return _provider;
}
