-- Lets an admin invite carry an intent to auto-issue a scoped API key
-- (currently only health:proxy:read) the moment the invited user accepts.
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS issue_api_key BOOLEAN NOT NULL DEFAULT false;
