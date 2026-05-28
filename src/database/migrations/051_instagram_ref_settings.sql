-- Instagram product reference settings
-- ref_managed: true = Allerac auto-generates refs, false = free text (default, retrocompat)
-- ref_prefix:  prefix used for auto-generated refs (e.g. "REF" → "REF-001")
-- ref_counter: current counter; next ref = prefix-(counter+1)

ALTER TABLE instagram_credentials
  ADD COLUMN IF NOT EXISTS ref_managed BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ref_prefix  VARCHAR(20) NOT NULL DEFAULT 'REF',
  ADD COLUMN IF NOT EXISTS ref_counter INT         NOT NULL DEFAULT 0;
