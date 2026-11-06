-- Migration 152: Health skill sleep dates.
-- Garmin dates sleep on the wake-up day (the night from D-1 to D is stored
-- under date D). The health skill told the model to use yesterday's date for
-- "how did I sleep last night?", which reads the wrong night. Rewrites that
-- line in the built-in skill. Idempotent: replace() is a no-op once applied.

UPDATE skills
   SET content = replace(
         content,
         '- For daily questions ("how did I sleep last night?"), use **get_daily_snapshot** with yesterday''s date',
         '- Sleep is dated on the day the user woke up: the night from D-1 to D is stored under date D' || chr(10) ||
         '- For "how did I sleep last night?" or "how did I sleep yesterday?" (the most recent night), use **get_daily_snapshot** with TODAY''s date; for other daily questions (steps, calories) use the day itself'
       )
 WHERE name = 'health-assistant'
   AND user_id IS NULL
   AND content LIKE '%with yesterday''s date%';
