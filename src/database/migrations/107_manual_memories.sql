-- Allow durable memories created directly from text, without an artificial chat conversation.
ALTER TABLE conversation_summaries
ALTER COLUMN conversation_id DROP NOT NULL;
