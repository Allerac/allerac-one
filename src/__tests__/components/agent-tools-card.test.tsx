import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentToolsCard from '@/app/components/system/AgentToolsCard';

const mockFetch = jest.fn();
const json = (body: unknown) => ({ ok: true, json: jest.fn().mockResolvedValue(body) }) as unknown as Response;

const data = {
  settings: { modules: {}, tools: {}, skills: {} },
  capabilities: [
    { id: 'health', label: 'Health', kind: 'module', tools: ['get_health_summary'], skills: ['health'], defaultEnabled: true, enabled: true },
    { id: 'music', label: 'Music', kind: 'module', tools: ['get_top_tracks'], skills: ['music'], defaultEnabled: false, enabled: false },
  ],
};

describe('AgentToolsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('toggles modules and tools and saves them', async () => {
    mockFetch.mockResolvedValueOnce(json({ data }));
    render(<AgentToolsCard isDarkMode={false} />);
    const music = await screen.findByLabelText('Enable Music');
    expect((music as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Tool get_top_tracks')).toBeNull();
    fireEvent.click(music);
    fireEvent.click(screen.getByLabelText('Tool get_health_summary'));

    mockFetch.mockResolvedValueOnce(json({ data }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tools' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe('/api/v1/unit/agent-tools');
    expect(JSON.parse(init.body)).toEqual({
      modules: { music: true }, tools: { get_health_summary: false }, skills: {},
    });
  });

  it('shows the load error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: jest.fn().mockResolvedValue({ error: { message: 'Admin only' } }) });
    render(<AgentToolsCard isDarkMode={false} />);
    expect(await screen.findByText('Admin only')).toBeTruthy();
  });
});
