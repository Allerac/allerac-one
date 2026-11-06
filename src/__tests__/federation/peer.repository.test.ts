/** @jest-environment node */

import '../__mocks__/db';
import pool from '@/app/clients/db';
import { PeerRepository } from '@/federation/peer.repository';

const mockQuery = pool.query as unknown as jest.Mock;

const row = {
  id: 'peer-id', unit_name: 'unit2', display_name: 'Unit 2', origin: 'https://unit2.example', protocol_version: '1',
  initiated_by_us: true, status: 'active', inbound_principal_id: 'p', inbound_capabilities: ['federation.agents.list'],
  outbound_capabilities: null, outbound_key_encrypted: 'enc', outbound_key_prefix: 'alr_live_x', nonce_local: null,
  nonce_remote: null, pairing_secret_hash: null, pairing_secret_encrypted: null, remote_request_id: null, request_ip: null,
  expires_at: null, created_by: 'admin', decided_by: null, decided_at: null, last_seen_at: null,
  created_at: new Date('2026-10-28T00:00:00Z'), updated_at: new Date('2026-10-28T00:00:00Z'),
};

describe('PeerRepository', () => {
  const repo = new PeerRepository();
  beforeEach(() => mockQuery.mockReset());

  it('maps rows to records', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    await expect(repo.get('peer-id')).resolves.toMatchObject({
      id: 'peer-id', unitName: 'unit2', initiatedByUs: true, inboundCapabilities: ['federation.agents.list'], outboundCapabilities: [],
    });
  });

  it('builds parameterized updates and keeps explicit nulls', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    await repo.update('peer-id', { status: 'revoked', outboundKeyEncrypted: null, unitName: undefined });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('SET status = $2, outbound_key_encrypted = $3, updated_at = NOW() WHERE id = $1');
    expect(params).toEqual(['peer-id', 'revoked', null]);
  });

  it('only considers open statuses when looking up by origin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo.findOpenByOrigin('https://unit2.example')).resolves.toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain("status IN ('pending_outbound', 'pending_inbound', 'active')");
  });

  it('expires pending rows and clears their secrets', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 2, rows: [] });
    await expect(repo.expirePending(new Date())).resolves.toBe(2);
    expect(mockQuery.mock.calls[0][0]).toContain('pairing_secret_hash = NULL, pairing_secret_encrypted = NULL');
  });
});
