import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UnitProfileCard from '@/app/components/system/UnitProfileCard';

const mockFetch = jest.fn();
const json = (body: unknown) => ({ ok: true, json: jest.fn().mockResolvedValue(body) }) as unknown as Response;

const data = {
  stored: null,
  effective: {
    name: 'barcelona', displayName: 'Barcelona', emoji: null, role: null, description: null,
    tags: [], agentDescriptions: {}, identityInPublicDomains: false,
  },
  exposedAgents: ['health'],
};

describe('UnitProfileCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('edits and saves the role, agent descriptions and public toggle', async () => {
    mockFetch.mockResolvedValueOnce(json({ data }));
    render(<UnitProfileCard isDarkMode={false} />);
    fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'my medical matters' } });
    fireEvent.change(screen.getByLabelText('Description for health'), { target: { value: 'Lab results' } });
    expect(screen.getByText(/I'm Barcelona, I take care of my medical matters/)).toBeTruthy();

    mockFetch.mockResolvedValueOnce(json({ data }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe('/api/v1/unit/profile');
    expect(JSON.parse(init.body)).toMatchObject({
      role: 'my medical matters', agentDescriptions: { health: 'Lab results' }, identityInPublicDomains: false,
    });
  });
});
