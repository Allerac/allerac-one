# Domain: Chat

**Slug:** `chat`  
**Route:** `/chat`  
**Icon:** 💬  
**Status:** Active  
**Default Skill:** None (general assistant — skill is auto-detected or user-selected)

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
- No forced skill — the skill system auto-activates based on message keywords or user selection.
- Acts as the default landing domain for users with no specific domain assignment.
