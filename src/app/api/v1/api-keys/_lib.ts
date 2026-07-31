import type { ControlApiKey } from '@/app/services/api-keys/api-key.service';

// Scopes a non-admin user may grant to their own keys. The general scope
// picker (ControlApiAccessTab) spans every domain and is admin-only; this is
// the server-side backstop in case that UI gate is ever bypassed.
export const SELF_SERVICE_SCOPES = ['health:proxy:read'];

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
