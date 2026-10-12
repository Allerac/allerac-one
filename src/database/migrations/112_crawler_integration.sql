-- Allerac Crawler control-plane and durable ingestion metadata.
CREATE TABLE IF NOT EXISTS crawler_sources (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_slug TEXT,
  start_urls JSONB NOT NULL CHECK (jsonb_typeof(start_urls) = 'array'),
  allowed_domains JSONB NOT NULL CHECK (jsonb_typeof(allowed_domains) = 'array'),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawler_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES crawler_sources(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'crawling', 'delivering', 'completed', 'failed', 'cancelled')),
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  max_pages INTEGER CHECK (max_pages IS NULL OR max_pages > 0),
  pages_crawled INTEGER NOT NULL DEFAULT 0 CHECK (pages_crawled >= 0),
  items_scraped INTEGER NOT NULL DEFAULT 0 CHECK (items_scraped >= 0),
  checkpoint TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawler_runs_claim
  ON crawler_runs (created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crawler_runs_source ON crawler_runs (source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crawler_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES crawler_runs(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawler_run_events_run
  ON crawler_run_events (run_id, created_at);

CREATE TABLE IF NOT EXISTS crawler_documents (
  source_id TEXT NOT NULL REFERENCES crawler_sources(id),
  external_id TEXT NOT NULL,
  document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  language TEXT NOT NULL,
  attribution JSONB NOT NULL,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  modified_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS crawler_ingestion_batches (
  idempotency_key TEXT PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES crawler_runs(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (run_id, batch_id)
);
