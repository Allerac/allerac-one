-- Add ig_business_user_id column to store the Graph API (Business Login) ID
-- Used for publishing posts. Keep ig_user_id for webhooks (legacy ID).

ALTER TABLE instagram_credentials
ADD COLUMN ig_business_user_id VARCHAR(255);

-- Backfill: set ig_business_user_id = ig_user_id for existing accounts
-- (This is a best-guess; ideally user reconnects to get the correct ID)
UPDATE instagram_credentials
SET ig_business_user_id = ig_user_id
WHERE ig_business_user_id IS NULL AND ig_user_id IS NOT NULL;
