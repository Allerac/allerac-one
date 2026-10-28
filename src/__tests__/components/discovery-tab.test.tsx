import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DiscoveryTab, { type PeerDto } from '@/app/components/system/DiscoveryTab';

const mockFetch = jest.fn();

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

const peer = (overrides: Partial<PeerDto>): PeerDto => ({
  id: 'peer-1',
  unitName: 'unit2',
  displayName: 'Unit 2',
  origin: 'https://unit2.example',
  initiatedByUs: true,
  status: 'active',
  inboundCapabilities: ['federation.agents.list'],
  outboundCapabilities: ['federation.agents.ask'],
  verificationCode: null,
  expiresAt: null,
  createdAt: '2026-10-28T13:00:00.000Z',
  ...overrides,
});

const manifest = (accepting = true) => ({
  origin: 'https://unit2.example',
  manifest: {
    unit: { name: 'unit2', displayName: 'Unit 2', url: 'https://unit2.example' },
    software: { release: '0.1.0' },
    pairing: { accepting },
    capabilities: [{ id: 'federation.agents.list', version: '1' }, { id: 'federation.agents.ask', version: '1' }],
  },
});

describe('DiscoveryTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('lists peers with status and never shows keys', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: { peers: [peer({ outboundKeyPrefix: 'alr_live_secretpref' } as Partial<PeerDto>)] },
    }));
    const { container } = render(<DiscoveryTab isDarkMode={false} />);
    const row = await screen.findByTestId('peer-peer-1');
    expect(within(row).getByText('Unit 2')).toBeInTheDocument();
    expect(within(row).getByText('Paired')).toBeInTheDocument();
    expect(within(row).getByText(/They can: List agents · You can: Ask agents/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('alr_live');
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/peers', { cache: 'no-store' });
  });

  it('looks up a Unit by URL and sends a pairing request', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: manifest() }))
      .mockResolvedValueOnce(jsonResponse({ data: { peer: peer({ status: 'pending_outbound', verificationCode: '123456' }) } }))
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [peer({ status: 'pending_outbound', verificationCode: '123456' })] } }));

    render(<DiscoveryTab isDarkMode />);
    await screen.findByText('No paired Units yet.');
    fireEvent.change(screen.getByLabelText('Unit URL'), { target: { value: 'https://unit2.example' } });
    fireEvent.click(screen.getByText('Look up'));

    expect(await screen.findByText(/0\.1\.0/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Send pairing request'));

    expect(await screen.findByText('123456')).toBeInTheDocument();
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/v1/peers/discover', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ url: 'https://unit2.example' }),
    }));
    const [, init] = mockFetch.mock.calls[2];
    expect(JSON.parse(init.body)).toEqual({
      url: 'https://unit2.example',
      grants: ['federation.agents.list', 'federation.agents.ask'],
      requested: ['federation.agents.list', 'federation.agents.ask'],
    });
  });

  it('does not offer pairing when the Unit is not accepting', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: manifest(false) }));
    render(<DiscoveryTab isDarkMode={false} />);
    await screen.findByText('No paired Units yet.');
    fireEvent.change(screen.getByLabelText('Unit URL'), { target: { value: 'https://openworld.example' } });
    fireEvent.click(screen.getByText('Look up'));
    expect(await screen.findByText('This Unit is not accepting pairing requests.')).toBeInTheDocument();
    expect(screen.queryByText('Send pairing request')).not.toBeInTheDocument();
  });

  it('accepts an inbound request with the selected grants', async () => {
    const inbound = peer({ status: 'pending_inbound', initiatedByUs: false, verificationCode: '654321', inboundCapabilities: ['federation.agents.list'] });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [inbound] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { peer: { ...inbound, status: 'active' } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [{ ...inbound, status: 'active', verificationCode: null }] } }));

    render(<DiscoveryTab isDarkMode={false} />);
    const card = await screen.findByTestId('inbound-peer-1');
    expect(within(card).getByText('654321')).toBeInTheDocument();
    fireEvent.click(within(card).getByLabelText(/Ask agents/));
    fireEvent.click(within(card).getByText('Accept'));

    await waitFor(() => expect(screen.getByText('Paired')).toBeInTheDocument());
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe('/api/v1/peers/peer-1/accept');
    expect(JSON.parse(init.body)).toEqual({ grants: ['federation.agents.list', 'federation.agents.ask'] });
  });

  it('rejects an inbound request', async () => {
    const inbound = peer({ status: 'pending_inbound', verificationCode: '654321' });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [inbound] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { peer: { ...inbound, status: 'rejected' } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [{ ...inbound, status: 'rejected' }] } }));
    render(<DiscoveryTab isDarkMode={false} />);
    fireEvent.click(await screen.findByText('Reject'));
    await waitFor(() => expect(screen.getByText('Rejected')).toBeInTheDocument());
    expect(mockFetch.mock.calls[1][0]).toBe('/api/v1/peers/peer-1/reject');
  });

  it('asks for confirmation before disconnecting', async () => {
    const confirm = jest.spyOn(window, 'confirm');
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [peer({})] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { peer: peer({ status: 'revoked' }) } }))
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [peer({ status: 'revoked' })] } }));
    render(<DiscoveryTab isDarkMode={false} />);

    confirm.mockReturnValueOnce(false);
    fireEvent.click(await screen.findByText('Disconnect'));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByText('Disconnect'));
    await waitFor(() => expect(screen.getByText('Revoked')).toBeInTheDocument());
    expect(mockFetch.mock.calls[1]).toEqual(['/api/v1/peers/peer-1', { method: 'DELETE' }]);
    confirm.mockRestore();
  });

  it('shows API errors', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { peers: [] } }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Peer could not be reached' } }, false));
    render(<DiscoveryTab isDarkMode={false} />);
    await screen.findByText('No paired Units yet.');
    fireEvent.change(screen.getByLabelText('Unit URL'), { target: { value: 'https://down.example' } });
    fireEvent.click(screen.getByText('Look up'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Peer could not be reached');
  });
});
