import pool from '@/app/clients/db';
import { DocumentService } from '@/app/services/rag/document.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import type { z } from 'zod';
import type { crawlerSourceSchema, documentBatchSchema, heartbeatSchema, runEventSchema, runUpdateSchema } from './crawler.schemas';

type SourceInput = z.infer<typeof crawlerSourceSchema>;
type BatchInput = z.infer<typeof documentBatchSchema>;
type HeartbeatInput = z.infer<typeof heartbeatSchema>;
type EventInput = z.infer<typeof runEventSchema>;
type UpdateInput = z.infer<typeof runUpdateSchema>;

export class CrawlerConflictError extends Error {}
export class CrawlerNotFoundError extends Error {}

export class CrawlerService {
  async listSources(ownerId: string) {
    const result = await pool.query(
      `SELECT s.id,s.name,s.domain_slug,s.start_urls,s.allowed_domains,
              s.configuration,s.enabled,s.created_at,s.updated_at,
              COUNT(r.id)::int AS run_count,
              MAX(r.created_at) AS last_run_at
       FROM crawler_sources s
       LEFT JOIN crawler_runs r ON r.source_id=s.id AND r.requested_by=$1
       WHERE s.owner_id=$1
       GROUP BY s.id
       ORDER BY s.name`,
      [ownerId],
    );
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      domainSlug: row.domain_slug,
      startUrls: row.start_urls,
      allowedDomains: row.allowed_domains,
      configuration: row.configuration ?? {},
      enabled: row.enabled,
      runCount: Number(row.run_count),
      lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async listRuns(userId: string, limit = 30) {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const result = await pool.query(
      `SELECT r.id,r.source_id,s.name AS source_name,r.status,r.worker_id,
              r.max_pages,r.pages_crawled,r.items_scraped,r.checkpoint,r.error,
              r.created_at,r.started_at,r.completed_at,r.updated_at,
              COALESCE(events.items,'[]'::jsonb) AS events
       FROM crawler_runs r
       JOIN crawler_sources s ON s.id=r.source_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(to_jsonb(event_row) ORDER BY event_row.created_at) AS items
         FROM (
           SELECT level,code,message,details,created_at
           FROM crawler_run_events
           WHERE run_id=r.id
           ORDER BY created_at DESC
           LIMIT 50
         ) event_row
       ) events ON TRUE
       WHERE r.requested_by=$1 AND s.owner_id=$1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [userId, boundedLimit],
    );
    return result.rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      status: row.status,
      workerId: row.worker_id,
      maxPages: row.max_pages,
      pagesCrawled: row.pages_crawled,
      itemsScraped: row.items_scraped,
      checkpoint: row.checkpoint,
      error: row.error,
      createdAt: new Date(row.created_at).toISOString(),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      updatedAt: new Date(row.updated_at).toISOString(),
      events: (row.events ?? []).map((event: {
        level: string;
        code: string;
        message: string;
        details: Record<string, unknown>;
        created_at: string;
      }) => ({
        level: event.level,
        code: event.code,
        message: event.message,
        details: event.details ?? {},
        createdAt: new Date(event.created_at).toISOString(),
      })),
    }));
  }

  async upsertSource(ownerId: string, source: SourceInput) {
    const result = await pool.query(
      `INSERT INTO crawler_sources (id,name,owner_id,domain_slug,start_urls,allowed_domains,configuration)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,domain_slug=EXCLUDED.domain_slug,
         start_urls=EXCLUDED.start_urls,allowed_domains=EXCLUDED.allowed_domains,
         configuration=EXCLUDED.configuration,updated_at=NOW()
       WHERE crawler_sources.owner_id=EXCLUDED.owner_id
       RETURNING id,name,domain_slug,start_urls,allowed_domains,configuration,enabled`,
      [source.sourceId, source.name, ownerId, source.domainSlug ?? null,
        JSON.stringify(source.startUrls), JSON.stringify(source.allowedDomains), JSON.stringify(source.configuration)],
    );
    if (!result.rows[0]) throw new CrawlerConflictError('Source ID belongs to another user');
    return result.rows[0];
  }

  async createRun(userId: string, sourceId: string, maxPages?: number | null) {
    const result = await pool.query(
      `INSERT INTO crawler_runs (source_id,requested_by,max_pages)
       SELECT id,$1,$3 FROM crawler_sources WHERE id=$2 AND owner_id=$1 AND enabled=TRUE
       RETURNING id,source_id,status,max_pages,created_at`,
      [userId, sourceId, maxPages ?? null],
    );
    if (!result.rows[0]) throw new CrawlerNotFoundError('Crawler source not found or disabled');
    return result.rows[0];
  }

  async claimRun(userId: string, workerId: string) {
    const result = await pool.query(
      `WITH candidate AS (
         SELECT r.id FROM crawler_runs r JOIN crawler_sources s ON s.id=r.source_id
         WHERE r.requested_by=$1 AND s.owner_id=$1 AND
           (r.status='pending' OR (r.status IN ('claimed','crawling','delivering') AND r.lease_expires_at<NOW()))
         ORDER BY r.created_at FOR UPDATE OF r SKIP LOCKED LIMIT 1
       )
       UPDATE crawler_runs r SET status='claimed',worker_id=$2,
         lease_expires_at=NOW()+INTERVAL '2 minutes',claimed_at=COALESCE(claimed_at,NOW()),updated_at=NOW()
       FROM candidate,crawler_sources s WHERE r.id=candidate.id AND s.id=r.source_id
       RETURNING r.id,r.max_pages,r.lease_expires_at,s.id source_id,s.name,s.start_urls,s.allowed_domains,s.configuration`,
      [userId, workerId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      schemaVersion: '1.0', runId: row.id,
      source: { schemaVersion: '1.0', sourceId: row.source_id, name: row.name,
        startUrls: row.start_urls, allowedDomains: row.allowed_domains, configuration: row.configuration },
      leaseExpiresAt: new Date(row.lease_expires_at).toISOString(), maxPages: row.max_pages,
    };
  }

  async heartbeat(userId: string, runId: string, input: HeartbeatInput) {
    const status = input.state === 'delivering' ? 'delivering' : 'crawling';
    const result = await pool.query(
      `UPDATE crawler_runs SET status=$1,lease_expires_at=NOW()+INTERVAL '2 minutes',
         pages_crawled=$2,items_scraped=$3,started_at=COALESCE(started_at,NOW()),updated_at=NOW()
       WHERE id=$4 AND requested_by=$5 AND worker_id=$6 AND status IN ('claimed','crawling','delivering') RETURNING id`,
      [status, input.pagesCrawled, input.itemsScraped, runId, userId, input.workerId],
    );
    if (!result.rows[0]) throw new CrawlerConflictError('Run is not leased by this worker');
  }

  async addEvent(userId: string, runId: string, event: EventInput) {
    const result = await pool.query(
      `INSERT INTO crawler_run_events (run_id,level,code,message,details)
       SELECT id,$1,$2,$3,$4 FROM crawler_runs WHERE id=$5 AND requested_by=$6 RETURNING id`,
      [event.level, event.code, event.message, JSON.stringify(event.details), runId, userId],
    );
    if (!result.rows[0]) throw new CrawlerNotFoundError('Crawler run not found');
  }

  async updateRun(userId: string, runId: string, update: UpdateInput) {
    const result = await pool.query(
      `UPDATE crawler_runs SET status=$1,error=$2,checkpoint=$3,
         completed_at=CASE WHEN $1 IN ('completed','failed','cancelled') THEN NOW() ELSE completed_at END,
         lease_expires_at=CASE WHEN $1 IN ('completed','failed','cancelled') THEN NULL ELSE lease_expires_at END,
         started_at=CASE WHEN $1='crawling' THEN COALESCE(started_at,NOW()) ELSE started_at END,updated_at=NOW()
       WHERE id=$4 AND requested_by=$5 AND status NOT IN ('completed','failed','cancelled') RETURNING id`,
      [update.status, update.error ?? null, update.checkpoint ?? null, runId, userId],
    );
    if (!result.rows[0]) throw new CrawlerConflictError('Run not found or already terminal');
  }

  async ingest(userId: string, runId: string, headerKey: string, batch: BatchInput) {
    if (batch.runId !== runId || batch.idempotencyKey !== headerKey) {
      throw new CrawlerConflictError('Run ID or Idempotency-Key does not match the request');
    }
    const existing = await pool.query(
      `SELECT response FROM crawler_ingestion_batches b JOIN crawler_runs r ON r.id=b.run_id
       WHERE b.idempotency_key=$1 AND r.requested_by=$2`, [headerKey, userId],
    );
    if (existing.rows[0]?.response) return existing.rows[0].response;
    const reserved = await pool.query(
      `INSERT INTO crawler_ingestion_batches (idempotency_key,run_id,batch_id)
       SELECT $1,id,$3 FROM crawler_runs WHERE id=$2 AND requested_by=$4 AND status IN ('claimed','crawling','delivering')
       ON CONFLICT DO NOTHING RETURNING idempotency_key`, [headerKey, runId, batch.batchId, userId],
    );
    if (!reserved.rows[0]) throw new CrawlerConflictError('Batch duplicated, in progress, or run is not active');

    let accepted = 0;
    let unchanged = 0;
    const rejected: Array<{ externalId: string; code: string; message: string; retryable: boolean }> = [];
    for (const item of batch.documents) {
      try {
        const source = await pool.query('SELECT owner_id,domain_slug FROM crawler_sources WHERE id=$1 AND owner_id=$2',
          [item.sourceId, userId]);
        if (!source.rows[0]) throw new Error('Source does not belong to this API user');
        const current = await pool.query(
          `SELECT cd.document_id,cd.content_hash,d.status
           FROM crawler_documents cd JOIN documents d ON d.id=cd.document_id
           WHERE cd.source_id=$1 AND cd.external_id=$2`,
          [item.sourceId, item.externalId]);
        if (current.rows[0]?.content_hash === item.contentHash && current.rows[0]?.status === 'completed') {
          await pool.query(
            'UPDATE crawler_documents SET last_seen_at=NOW(),retrieved_at=$3 WHERE source_id=$1 AND external_id=$2',
            [item.sourceId, item.externalId, item.retrievedAt]);
          unchanged++;
          continue;
        }
        let documentId = current.rows[0]?.document_id as string | undefined;
        if (!documentId) {
          const created = await pool.query(
            `INSERT INTO documents (filename,file_type,file_size,uploaded_by,status,domain_slug,metadata)
             VALUES ($1,$2,$3,$4,'processing',$5,$6) RETURNING id`,
            [item.title, item.contentType, Buffer.byteLength(item.content, 'utf8'), userId, source.rows[0].domain_slug,
              JSON.stringify({ crawler: { sourceId: item.sourceId, externalId: item.externalId, canonicalUrl: item.canonicalUrl } })]);
          const createdDocumentId = created.rows[0].id as string;
          documentId = createdDocumentId;
          await pool.query(
            `INSERT INTO crawler_documents
             (source_id,external_id,document_id,canonical_url,title,content_hash,content_type,language,
              attribution,source_metadata,published_at,modified_at,retrieved_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [item.sourceId,item.externalId,documentId,item.canonicalUrl,item.title,item.contentHash,item.contentType,
              item.language,JSON.stringify(item.attribution),JSON.stringify(item.metadata),
              item.publishedAt ?? null,item.modifiedAt ?? null,item.retrievedAt]);
          await new DocumentService(new EmbeddingService()).processDocumentContent(createdDocumentId, item.content);
        } else {
          await new DocumentService(new EmbeddingService()).reprocessDocumentContent(documentId, item.content);
          await pool.query(
            `UPDATE crawler_documents SET canonical_url=$3,title=$4,content_hash=$5,content_type=$6,
             language=$7,attribution=$8,source_metadata=$9,published_at=$10,modified_at=$11,retrieved_at=$12,last_seen_at=NOW()
             WHERE source_id=$1 AND external_id=$2`,
            [item.sourceId,item.externalId,item.canonicalUrl,item.title,item.contentHash,item.contentType,item.language,
              JSON.stringify(item.attribution),JSON.stringify(item.metadata),item.publishedAt ?? null,
              item.modifiedAt ?? null,item.retrievedAt]);
        }
        const processed = await pool.query('SELECT status,error_message FROM documents WHERE id=$1', [documentId]);
        if (processed.rows[0]?.status !== 'completed') throw new Error(processed.rows[0]?.error_message || 'Embedding failed');
        accepted++;
      } catch (error) {
        rejected.push({ externalId: item.externalId, code: 'ingestion_failed',
          message: error instanceof Error ? error.message : 'Unknown ingestion error', retryable: true });
      }
    }
    const response = { schemaVersion: '1.0', runId, batchId: batch.batchId, accepted, unchanged,
      rejected, checkpoint: batch.finalBatch ? batch.batchId : null };
    await pool.query('UPDATE crawler_ingestion_batches SET response=$2,completed_at=NOW() WHERE idempotency_key=$1',
      [headerKey, JSON.stringify(response)]);
    return response;
  }
}
