-- Migration: Add emotion column to conversation_summaries
ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS emotion TEXT;