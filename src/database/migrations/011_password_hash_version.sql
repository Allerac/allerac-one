-- Migration: add password_hash_version to users table
-- version 1 = old bcrypt(plaintext) hashes created before client-side SHA-256 hashing
-- version 2 = new bcrypt(sha256(plaintext)) hashes (current scheme)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash_version INTEGER NOT NULL DEFAULT 2;

-- Mark all existing accounts as version 1 so the migration flow is triggered on next login
UPDATE users SET password_hash_version = 1 WHERE password_hash IS NOT NULL;
