/** @jest-environment node */

import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { CrawlerService } from '@/app/services/crawler/crawler.service';
import { PUT as putSource } from '@/app/api/v1/crawler/sources/route';
import { POST as createRun } from '@/app/api/v1/crawler/runs/route';
import { POST as claimRun } from '@/app/api/v1/crawler/runs/claim/route';
import { POST as heartbeat } from '@/app/api/v1/crawler/runs/[id]/heartbeat/route';
import { POST as ingest } from '@/app/api/v1/crawler/runs/[id]/documents-upsert/route';

jest.mock('@/app/api/v1/_lib/auth', () => ({ requireApiUser: jest.fn() }));
jest.mock('@/app/services/crawler/crawler.service', () => {
  class CrawlerConflictError extends Error {}
  class CrawlerNotFoundError extends Error {}
  return { CrawlerService: jest.fn(), CrawlerConflictError, CrawlerNotFoundError };
});

const mockRequireApiUser = jest.mocked(requireApiUser);
const MockCrawlerService = CrawlerService as jest.MockedClass<typeof CrawlerService>;
const runId = '00112233-4455-6677-8899-aabbccddeeff';
const user = { id: 'user-id', email: 'user@example.com', name: 'User', isAdmin: false, authMode: 'api_key' as const };

function request(path: string, method: string, body: unknown, headers?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
function params(id = runId) { return { params: Promise.resolve({ id }) }; }
function service(overrides: Record<string, jest.Mock> = {}) {
  const instance = {
    upsertSource: jest.fn(), createRun: jest.fn(), claimRun: jest.fn(),
    heartbeat: jest.fn(), addEvent: jest.fn(), updateRun: jest.fn(), ingest: jest.fn(),
    ...overrides,
  };
  MockCrawlerService.mockImplementation(() => instance as any);
  return instance;
}

describe('Control API v1 crawler integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireApiUser.mockResolvedValue(user);
  });

  it('upserts a source with its dedicated scope', async () => {
    const instance = service({ upsertSource: jest.fn().mockResolvedValue({ id: 'receita-duimp' }) });
    const response = await putSource(request('/api/v1/crawler/sources', 'PUT', {
      sourceId: 'receita-duimp', name: 'Receita DUIMP',
      startUrls: ['https://www.gov.br/example'], allowedDomains: ['www.gov.br'], configuration: {},
    }));
    expect(response.status).toBe(200);
    expect(mockRequireApiUser).toHaveBeenCalledWith('crawler:sources:write', expect.any(Request));
    expect(instance.upsertSource).toHaveBeenCalledWith('user-id', expect.objectContaining({ sourceId: 'receita-duimp' }));
  });

  it('queues a crawl run', async () => {
    const instance = service({ createRun: jest.fn().mockResolvedValue({ id: runId, status: 'pending' }) });
    const response = await createRun(request('/api/v1/crawler/runs', 'POST', {
      sourceId: 'receita-duimp', maxPages: 10,
    }));
    expect(response.status).toBe(202);
    expect(instance.createRun).toHaveBeenCalledWith('user-id', 'receita-duimp', 10);
  });

  it('returns 204 when no work can be claimed', async () => {
    service({ claimRun: jest.fn().mockResolvedValue(null) });
    const response = await claimRun(request('/api/v1/crawler/runs/claim', 'POST', { workerId: 'worker-1' }));
    expect(response.status).toBe(204);
  });

  it('renews a worker lease', async () => {
    const instance = service({ heartbeat: jest.fn().mockResolvedValue(undefined) });
    const response = await heartbeat(request(`/api/v1/crawler/runs/${runId}/heartbeat`, 'POST', {
      schemaVersion: '1.0', workerId: 'worker-1', state: 'crawling', pagesCrawled: 3, itemsScraped: 2,
    }), params());
    expect(response.status).toBe(204);
    expect(instance.heartbeat).toHaveBeenCalledWith('user-id', runId, expect.objectContaining({ pagesCrawled: 3 }));
  });

  it('requires an idempotency key for document ingestion', async () => {
    service();
    const response = await ingest(request(`/api/v1/crawler/runs/${runId}/documents-upsert`, 'POST', {}), params());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('returns the durable ingestion acknowledgement', async () => {
    const acknowledgement = {
      schemaVersion: '1.0', runId, batchId: 'batch-1',
      accepted: 1, unchanged: 0, rejected: [], checkpoint: 'batch-1',
    };
    const instance = service({ ingest: jest.fn().mockResolvedValue(acknowledgement) });
    const body = {
      schemaVersion: '1.0', runId, batchId: 'batch-1', idempotencyKey: 'crawler-key-1', finalBatch: true,
      documents: [{
        schemaVersion: '1.0', sourceId: 'receita-duimp', externalId: 'page-1',
        canonicalUrl: 'https://www.gov.br/example', title: 'DUIMP', content: 'Normalized content',
        contentHash: `sha256:${'a'.repeat(64)}`, contentType: 'text/html', language: 'pt-BR',
        retrievedAt: '2026-08-04T10:00:00.000Z',
        attribution: { name: 'Receita Federal', url: 'https://www.gov.br/example' }, metadata: {},
      }],
    };
    const response = await ingest(request(`/api/v1/crawler/runs/${runId}/documents-upsert`, 'POST', body,
      { 'idempotency-key': 'crawler-key-1' }), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(acknowledgement);
    expect(instance.ingest).toHaveBeenCalledWith('user-id', runId, 'crawler-key-1', expect.any(Object));
  });
});
