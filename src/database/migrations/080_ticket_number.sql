-- Migration 080: Add sequential number to tickets
-- Each user gets their own sequence (ticket #1, #2, #3...)

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS number INTEGER;

CREATE SEQUENCE IF NOT EXISTS tickets_number_seq;

UPDATE tickets SET number = nextval('tickets_number_seq') WHERE number IS NULL;

ALTER TABLE tickets ALTER COLUMN number SET DEFAULT nextval('tickets_number_seq');
ALTER TABLE tickets ALTER COLUMN number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_user_number_idx ON tickets (user_id, number);
