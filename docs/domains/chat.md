# Domain: Chat

**Slug:** `chat`  
**Route:** `/chat`  
**Icon:** 💬  
**Status:** Active  
**Default Skill:** `chat` (general-purpose assistant, defined in `skills/chat.md`)

## Purpose

The Chat domain is the general-purpose assistant and the **hub** of Allerac. Unlike other domains, it shows conversations from all domains in the sidebar, giving admins a unified view. Regular users see only their own chat conversations here.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/chat/page.tsx` |
| Client layout | `src/app/chat/ChatClient.tsx` |
| Route handler | `src/app/api/chat/route.ts` |
| Chat service | `src/app/services/database/chat.service.ts` |

## Tools Available

All shared tools: `get_today_info`, `search_web`, `read_url`.  
Health tools are also injected here when `HEALTH_WORKER_SECRET` is set.

## DB Scope

- `chat_conversations` where `domain_slug = 'chat'`
- `conversation_summaries` where `domain_slug = 'chat'`
- `documents` where `domain_slug = 'chat'`

## Notes

- Chat is the only domain that can see **all** conversations across domains in the sidebar (admin only).
- The system skill loader binds `skills/chat.md` to `chat` through its `domain: chat` frontmatter on startup, using the same `domain_skill_defaults` mechanism as other domains.
- Acts as the default landing domain for users with no specific domain assignment.

- New conversations activate the domain default unless the user explicitly selects another skill. The domain default is locked against automatic keyword switching, keeping the general-purpose persona stable.
- Existing conversations retain their active skill. The new default becomes available after system skill synchronization on startup.
