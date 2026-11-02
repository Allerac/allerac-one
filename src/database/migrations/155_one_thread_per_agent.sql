-- Migration 155: one thread per remote agent (simplification phase 5).
--
-- The home Unit keeps one active thread per (user, peer, agent). Extra threads
-- from the P4b "New thread" button are archived: kept read-only, never merged
-- or deleted, and still reachable from the agent page's archive (?thread=).
--
-- * The kept thread is the default one (is_default). When a group has no
--   default, the most recent thread becomes the default.
-- * Threads with a pending async ask (P4c: status 'pending' with a
--   remote_run_id) are NOT archived here, so the poller can finish them. They
--   are archived at the next opportunity, once nothing is pending (the inbox
--   listing runs the same rule: InboxRepository.archiveResolvedExtraThreads).
-- * topic_reset_pending: the user pressed "New topic"; the next ask to a v3
--   peer carries topic_reset=true, then the flag is cleared.
--
-- Idempotent: safe to run again.

ALTER TABLE federated_threads
  ADD COLUMN IF NOT EXISTS topic_reset_pending BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, peer_id, agent_slug
           ORDER BY (archived_at IS NULL) DESC, last_message_at DESC NULLS LAST, created_at DESC, id
         ) AS rn,
         BOOL_OR(is_default) OVER (PARTITION BY user_id, peer_id, agent_slug) AS has_default
  FROM federated_threads
)
UPDATE federated_threads t
   SET is_default = true, archived_at = NULL
  FROM ranked r
 WHERE t.id = r.id AND r.rn = 1 AND NOT r.has_default;

UPDATE federated_threads t
   SET archived_at = NOW()
 WHERE NOT t.is_default
   AND t.archived_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM federated_messages m
      WHERE m.thread_id = t.id AND m.status = 'pending' AND m.remote_run_id IS NOT NULL
   );

CREATE INDEX IF NOT EXISTS idx_federated_threads_archived
  ON federated_threads (user_id, peer_id, agent_slug, last_message_at DESC)
  WHERE archived_at IS NOT NULL;
