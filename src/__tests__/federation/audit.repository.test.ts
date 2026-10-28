/** @jest-environment node */

import '../__mocks__/db';
import pool from '@/app/clients/db';
import { FederationAuditRepository } from '@/federation/audit.repository';

const mockQuery = pool.query as unknown as jest.Mock;

describe('FederationAuditRepository', () => {
  const repo = new FederationAuditRepository();
  beforeEach(() => mockQuery.mockReset());

  it('writes metadata with parameters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.record({ direction: 'outbound', peerId: 'peer', capability: 'federation.agents.ask', outcome: 'ok', httpStatus: 200 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO federation_audit_log');
    expect(params).toEqual(['outbound', 'peer', null, null, 'federation.agents.ask', null, 'ok', 200, null, null, null, null]);
  });

  it('never throws when the write fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(repo.record({ direction: 'inbound', peerId: null, capability: 'x', outcome: 'error' })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('caps list size', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.listForPeer('peer', 10_000);
    expect(mockQuery.mock.calls[0][1]).toEqual(['peer', 200]);
  });
});
