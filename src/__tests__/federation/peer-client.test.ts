/** @jest-environment node */

import { normalizePeerOrigin, PeerClient } from '@/federation/peer-client';
import { buildManifest } from '@/federation/manifest';

const manifest = () => buildManifest({ env: { ALLERAC_UNIT_NAME: 'unit2', ALLERAC_PUBLIC_URL: 'https://unit2.example' }, release: '1' });
const respond = (body: unknown, status = 200) => jest.fn().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('normalizePeerOrigin', () => {
  it('normalizes to the origin', () => {
    expect(normalizePeerOrigin(' https://Unit2.Example/some/path?q=1 ', {})).toBe('https://unit2.example');
  });
  it.each(['http://unit2.example', 'https://localhost', 'https://10.0.0.5', 'https://192.168.1.2', 'https://app', 'https://box.local'])(
    'rejects %s by default',
    url => expect(() => normalizePeerOrigin(url, {})).toThrow(expect.objectContaining({ code: 'insecure_url' })),
  );
  it('allows LAN/http with ALLERAC_FEDERATION_ALLOW_INSECURE', () => {
    expect(normalizePeerOrigin('http://192.168.1.2:8081', { ALLERAC_FEDERATION_ALLOW_INSECURE: 'true' })).toBe('http://192.168.1.2:8081');
  });
  it.each(['not a url', 'ftp://unit2.example', 'https://user:pass@unit2.example'])('rejects %s', url => {
    expect(() => normalizePeerOrigin(url, { ALLERAC_FEDERATION_ALLOW_INSECURE: 'true' })).toThrow(expect.objectContaining({ code: 'invalid_url' }));
  });
});

describe('PeerClient', () => {
  it('fetches and validates a manifest', async () => {
    const fetchImpl = respond(manifest());
    await expect(new PeerClient(fetchImpl).fetchManifest('https://unit2.example')).resolves.toMatchObject({ unit: { name: 'unit2' } });
    expect(fetchImpl).toHaveBeenCalledWith('https://unit2.example/.well-known/allerac', expect.objectContaining({ redirect: 'error' }));
  });
  it('rejects invalid manifests and protocol mismatches', async () => {
    await expect(new PeerClient(respond({ hello: 'world' })).fetchManifest('https://x.example')).rejects.toMatchObject({ code: 'peer_invalid_response' });
    await expect(new PeerClient(respond({ ...manifest(), protocolVersion: '99' })).fetchManifest('https://x.example'))
      .rejects.toMatchObject({ code: 'protocol_mismatch' });
  });
  it('rejects oversized and non-JSON responses', async () => {
    await expect(new PeerClient(respond('x'.repeat(70_000))).fetchManifest('https://x.example')).rejects.toMatchObject({ code: 'peer_invalid_response' });
    await expect(new PeerClient(respond('<html>')).fetchManifest('https://x.example')).rejects.toMatchObject({ code: 'peer_invalid_response' });
  });
  it('maps network errors and timeouts to peer_unreachable', async () => {
    await expect(new PeerClient(jest.fn().mockRejectedValue(new TypeError('fetch failed'))).fetchManifest('https://x.example'))
      .rejects.toMatchObject({ code: 'peer_unreachable' });
    const hanging = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await expect(new PeerClient(hanging, 10).fetchManifest('https://x.example')).rejects.toMatchObject({ code: 'peer_unreachable' });
  });
  it('maps a closed pairing endpoint to peer_not_accepting', async () => {
    const client = new PeerClient(respond({ error: { code: 'not_found' } }, 404));
    await expect(client.sendPairingRequest('https://x.example', {
      fromOrigin: 'https://a.example', fromRequestId: '6a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
      nonce: 'n'.repeat(32), pairingSecret: 's'.repeat(43), requestedCapabilities: [],
    })).rejects.toMatchObject({ code: 'peer_not_accepting' });
  });
});
