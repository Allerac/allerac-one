import type { ControlApiKey } from '@/app/services/api-keys/api-key.service';

// Scopes available to restricted, domain-only accounts (e.g. /bridge, /sales)
// that can't reach the full admin-driven scope picker (ControlApiAccessTab,
// admin-only) to self-issue their own key. This is also the server-side
// backstop in case that admin UI gate is ever bypassed.
// chat:write only lets a key act as the issuing user within domains that
// user already has access to (enforced separately at the conversation
// level) — self-issuing one doesn't grant anything beyond what they can
// already do through the chat UI itself.
export const DEFAULT_DOMAIN_USERS_SCOPES = ['health:proxy:read', 'chat:write'];

export function apiKeyDto(apiKey: ControlApiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    scopes: apiKey.scopes,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
  };
}
