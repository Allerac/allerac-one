/** @jest-environment node */

import fs from 'fs';
import path from 'path';
import { CONTROL_API_SCOPES, hasScope, isKnownScope, unknownScopes } from '@/app/services/api-keys/api-key-scopes';

describe('hasScope', () => {
  it('denies an empty scope list', () => {
    expect(hasScope([], 'profile:read')).toBe(false);
  });

  it('denies missing scope data (null, undefined, non-array)', () => {
    expect(hasScope(null, 'profile:read')).toBe(false);
    expect(hasScope(undefined, 'profile:read')).toBe(false);
    expect(hasScope('profile:read', 'profile:read')).toBe(false);
  });

  it('denies a missing or unknown required scope', () => {
    expect(hasScope(['profile:read'], undefined)).toBe(false);
    expect(hasScope(['profile:read'], '')).toBe(false);
    expect(hasScope(['made:up'], 'made:up')).toBe(false);
  });

  it('allows a valid scope that is explicitly granted', () => {
    expect(hasScope(['profile:read', 'chat:write'], 'chat:write')).toBe(true);
    expect(hasScope(['profile:read'], 'chat:write')).toBe(false);
  });

  it('has no wildcard scope', () => {
    expect(isKnownScope('*')).toBe(false);
    expect(hasScope(['*'], 'profile:read')).toBe(false);
    expect(hasScope(['chat:*'], 'chat:read')).toBe(false);
  });

  it('reports unknown scopes', () => {
    expect(unknownScopes(['profile:read', 'x', '*'])).toEqual(['x', '*']);
  });
});

describe('Control API v1 routes and the scope catalog', () => {
  const root = path.join(process.cwd(), 'src/app/api');

  function routeFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return routeFiles(full);
      return entry.name === 'route.ts' ? [full] : [];
    });
  }

  const files = routeFiles(root);
  const bearerScopes = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/require(?:Api|ApiDomain)User\(\s*'([^']+)'/g)) {
      bearerScopes.add(match[1]);
    }
  }

  it('finds the API-key-enabled routes', () => {
    expect(bearerScopes.size).toBeGreaterThan(20);
  });

  it('every scope required by an API-key-enabled route is a known scope', () => {
    expect([...bearerScopes].filter(scope => !isKnownScope(scope))).toEqual([]);
  });

  it('catalog has no duplicates', () => {
    expect(new Set(CONTROL_API_SCOPES).size).toBe(CONTROL_API_SCOPES.length);
  });
});
