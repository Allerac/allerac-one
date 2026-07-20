import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ControlApiAccessTab from '@/app/components/system/ControlApiAccessTab';

const mockFetch = jest.fn();

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('ControlApiAccessTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('lists the current user access keys', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        apiKeys: [{
          id: 'key-id',
          name: 'Android Robot',
          prefix: 'alr_live_abc123',
          scopes: ['chat:read', 'chat:write'],
          lastUsedAt: null,
          revokedAt: null,
          expiresAt: null,
          createdAt: '2026-07-19T12:00:00.000Z',
        }],
      },
    }));

    render(<ControlApiAccessTab isDarkMode />);

    expect(await screen.findByText('alr_live_abc123…')).toBeInTheDocument();
    expect(screen.getAllByText('chat:read')).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/api-keys', { cache: 'no-store' });
  });

  it('creates a scoped Android Robot key and shows its secret once', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { apiKeys: [] } }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          apiKey: {
            id: 'new-key',
            name: 'Android Robot',
            prefix: 'alr_live_new123',
            scopes: ['profile:read', 'chat:read', 'chat:write', 'capabilities:read'],
            lastUsedAt: null,
            revokedAt: null,
            expiresAt: null,
            createdAt: '2026-07-19T12:00:00.000Z',
          },
          secret: 'alr_live_full_secret',
        },
      }, true));

    render(<ControlApiAccessTab isDarkMode />);

    await screen.findByText('No active access keys.');
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByDisplayValue('alr_live_full_secret')).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const request = mockFetch.mock.calls[1];
    expect(request[0]).toBe('/api/v1/api-keys');
    expect(request[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(request[1].body)).toEqual({
      name: 'Android Robot',
      scopes: ['profile:read', 'chat:read', 'chat:write', 'capabilities:read'],
      expiresAt: null,
    });
  });
});
