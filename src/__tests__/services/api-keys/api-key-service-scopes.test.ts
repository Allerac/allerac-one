/** @jest-environment node */

import {
  CONTROL_API_SCOPES,
  SERVICE_ALLOWED_SCOPES,
  isKnownScope,
  isServiceAllowedScope,
} from '@/app/services/api-keys/api-key-scopes';

describe('federation and service scopes', () => {
  it.each([
    'federation:manifest:read',
    'federation:agents:list',
    'federation:agents:ask',
    'federation:runs:create',
    'federation:runs:read',
  ])('%s is a known scope and allowed for service keys', scope => {
    expect(isKnownScope(scope)).toBe(true);
    expect(isServiceAllowedScope(scope)).toBe(true);
  });

  it('every service-allowed scope is a known Control API scope', () => {
    for (const scope of SERVICE_ALLOWED_SCOPES) {
      expect(CONTROL_API_SCOPES).toContain(scope);
    }
  });

  it.each(['memory:read', 'memory:write', 'notes:write', 'chat:write', 'agents:write', 'made:up', '', null])(
    'rejects %p for service keys',
    scope => {
      expect(isServiceAllowedScope(scope)).toBe(false);
    },
  );
});
