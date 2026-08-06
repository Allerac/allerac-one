import { z } from 'zod';

const httpUrl = z.string().url().refine((value) => /^https?:\/\//.test(value), 'Must be an HTTP(S) URL');
const sourceId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(200);
const timestamp = z.string().datetime({ offset: true });

export const crawlerSourceSchema = z.object({
  sourceId, name: z.string().min(1).max(300), startUrls: z.array(httpUrl).min(1),
  allowedDomains: z.array(z.string().min(1)).min(1),
  configuration: z.record(z.unknown()).default({}),
  domainSlug: z.string().min(1).max(200).nullable().optional(),
});
export const createCrawlerRunSchema = z.object({
  sourceId, maxPages: z.number().int().positive().nullable().optional(),
});
export const claimRunSchema = z.object({ workerId: z.string().min(1).max(200) });
export const heartbeatSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'), workerId: z.string().min(1).max(200),
  state: z.enum(['claiming', 'crawling', 'delivering', 'degraded']),
  pagesCrawled: z.number().int().nonnegative().default(0),
  itemsScraped: z.number().int().nonnegative().default(0),
});
export const runEventSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'), level: z.enum(['info', 'warning', 'error']),
  code: z.string().min(1).max(100), message: z.string().min(1).max(2000),
  details: z.record(z.unknown()).default({}),
});
export const runUpdateSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  status: z.enum(['crawling', 'delivering', 'completed', 'failed', 'cancelled']),
  error: z.string().max(4000).nullable().optional(),
  checkpoint: z.string().max(500).nullable().optional(),
});
const normalizedDocumentSchema = z.object({
  schemaVersion: z.literal('1.0'), sourceId, externalId: z.string().min(1).max(2048),
  canonicalUrl: httpUrl, title: z.string().min(1).max(1000), content: z.string().min(1),
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  contentType: z.string().min(1).max(200), section: z.string().max(200).nullable().optional(),
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  publishedAt: timestamp.nullable().optional(), modifiedAt: timestamp.nullable().optional(),
  retrievedAt: timestamp,
  attribution: z.object({
    name: z.string().min(1).max(300), url: httpUrl,
    license: z.string().max(200).nullable().optional(),
  }),
  metadata: z.record(z.unknown()).default({}),
});
export const documentBatchSchema = z.object({
  schemaVersion: z.literal('1.0'), runId: z.string().uuid(),
  batchId: z.string().min(1).max(200), idempotencyKey: z.string().min(8).max(300),
  documents: z.array(normalizedDocumentSchema).min(1).max(100), finalBatch: z.boolean().default(false),
}).superRefine((batch, context) => {
  const keys = new Set<string>();
  batch.documents.forEach((document, index) => {
    const key = `${document.sourceId}\0${document.externalId}`;
    if (keys.has(key)) context.addIssue({ code: 'custom', path: ['documents', index], message: 'Duplicate sourceId/externalId' });
    keys.add(key);
  });
});

