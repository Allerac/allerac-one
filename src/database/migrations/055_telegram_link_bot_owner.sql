-- Link Telegram users to their bot owner's web account.
-- When a Telegram user ID appears in a bot's allowed_telegram_ids, they are
-- the bot owner using their own private bot — their notes, memory and
-- conversations should belong to the same web account.

-- 1. Migrate notes created by the virtual user to the real web user
UPDATE user_notes un
SET user_id = tbc.user_id
FROM telegram_bot_configs tbc
JOIN telegram_chat_mapping tcm ON tcm.telegram_user_id = ANY(tbc.allowed_telegram_ids)
WHERE un.user_id = tcm.user_id
  AND un.user_id != tbc.user_id;

-- 2. Migrate note documents (RAG chunks) to the real web user
UPDATE documents d
SET uploaded_by = tbc.user_id
FROM telegram_bot_configs tbc
JOIN telegram_chat_mapping tcm ON tcm.telegram_user_id = ANY(tbc.allowed_telegram_ids)
WHERE d.uploaded_by = tcm.user_id
  AND d.domain_slug = 'notes'
  AND d.uploaded_by != tbc.user_id;

-- 3. Update the chat mapping to point to the real web user
UPDATE telegram_chat_mapping tcm
SET user_id = tbc.user_id
FROM telegram_bot_configs tbc
WHERE tcm.telegram_user_id = ANY(tbc.allowed_telegram_ids)
  AND tcm.user_id != tbc.user_id;
