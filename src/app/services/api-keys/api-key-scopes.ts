// Control API v1 API-key scopes.
//
// Deny by default:
// - a key grants exactly the scopes listed on it, nothing more;
// - an empty (or missing) scope list grants nothing;
// - scopes that are not in CONTROL_API_SCOPES are never granted, even if a
//   key row happens to carry them;
// - there is no wildcard scope. To give a key access to every route, list
//   every scope explicitly (the "Full access" preset in the admin UI does this).
//
// This module has no server-only imports so it can be shared with client
// components.

export const CONTROL_API_SCOPES = [
  'profile:read',
  'domains:read',
  'capabilities:read',
  'chat:read',
  'chat:write',
  'memory:read',
  'memory:write',
  'documents:read',
  'documents:write',
  'notes:read',
  'notes:write',
  'search:read',
  'tickets:read',
  'tickets:write',
  'agents:read',
  'agents:write',
  'jobs:read',
  'jobs:write',
  'skills:read',
  'skills:write',
  'benchmark:read',
  'benchmark:write',
  'crawler:sources:write',
  'crawler:runs:write',
  'crawler:runs:claim',
  'crawler:runs:heartbeat',
  'crawler:events:write',
  'crawler:documents:write',
  'health:read',
  'health:write',
  'health:proxy:read',
  'email:read',
  'email:write',
  'finance:read',
  'finance:write',
  'music:read',
  'music:write',
  'federation:manifest:read',
  'federation:agents:list',
  'federation:agents:ask',
  'federation:runs:create',
  'federation:runs:read',
  'federation:peer:revoke',
] as const;

export type ControlApiScope = (typeof CONTROL_API_SCOPES)[number];

const KNOWN_SCOPES: ReadonlySet<string> = new Set(CONTROL_API_SCOPES);

export function isKnownScope(scope: unknown): scope is ControlApiScope {
  return typeof scope === 'string' && KNOWN_SCOPES.has(scope);
}

export function unknownScopes(scopes: readonly string[]): string[] {
  return scopes.filter(scope => !isKnownScope(scope));
}

/**
 * Returns true only when `requiredScope` is a known scope and is explicitly
 * listed in `grantedScopes`. Anything else (empty, null, non-array, unknown
 * required scope, missing required scope) is denied.
 */
export function hasScope(grantedScopes: unknown, requiredScope: unknown): boolean {
  if (!isKnownScope(requiredScope)) return false;
  if (!Array.isArray(grantedScopes) || grantedScopes.length === 0) return false;
  return grantedScopes.includes(requiredScope);
}

// Scopes a service principal (peer Unit) key may hold. Anything else is refused
// at key creation and never granted at request time.
export const SERVICE_ALLOWED_SCOPES = [
  'profile:read',
  'capabilities:read',
  'federation:manifest:read',
  'federation:agents:list',
  'federation:agents:ask',
  'federation:runs:create',
  'federation:runs:read',
  'federation:peer:revoke',
] as const satisfies readonly ControlApiScope[];

const SERVICE_ALLOWED: ReadonlySet<string> = new Set(SERVICE_ALLOWED_SCOPES);

export function isServiceAllowedScope(scope: unknown): boolean {
  return typeof scope === 'string' && SERVICE_ALLOWED.has(scope);
}
