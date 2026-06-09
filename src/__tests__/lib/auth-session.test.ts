/** @jest-environment node */

import {
  authenticationErrorResponse,
  ForbiddenError,
  UnauthorizedError,
} from '@/app/lib/auth-session';

describe('authenticationErrorResponse', () => {
  it('maps unauthorized errors to a stable 401 response', async () => {
    const response = authenticationErrorResponse(new UnauthorizedError());

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: 'Unauthorized' });
  });

  it('maps forbidden errors to a stable 403 response', async () => {
    const response = authenticationErrorResponse(new ForbiddenError());

    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: 'Forbidden' });
  });

  it('supports text responses for streaming endpoints', async () => {
    const response = authenticationErrorResponse(
      new UnauthorizedError(),
      { format: 'text' },
    );

    expect(response?.status).toBe(401);
    expect(await response?.text()).toBe('Unauthorized');
  });

  it('leaves unrelated failures to the route fallback', () => {
    expect(authenticationErrorResponse(new Error('database unavailable'))).toBeNull();
  });
});
