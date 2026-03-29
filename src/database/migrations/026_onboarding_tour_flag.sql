-- Add onboarding tour flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_onboarding_tour BOOLEAN DEFAULT FALSE;
