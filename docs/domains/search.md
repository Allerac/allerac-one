# Domain: Search

**Slug:** `search`  
**Route:** `/search`  
**Icon:** 🔍  
**Status:** Active  
**Default Skill:** `search` (`skills/search.md`)

## Purpose

Dedicated web search assistant. The `search_web` tool is **force-activated** — every message triggers a real-time web search before the AI responds. Designed for news, price lookups, people/company research, and anything requiring current information.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/search/page.tsx` |
| Client layout | `src/app/search/SearchClient.tsx` |
| Search tool | `src/app/tools/search-web.tool.ts` |
| Skill | `skills/search.md` |
| Migration | `src/database/migrations/046_domain_search.sql` |

## Tools Available

| Tool | Description |
|------|-------------|
| `search_web` | Real-time web search via Tavily API (**force-activated**) |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## External Integrations

- **Tavily API** — requires `TAVILY_API_KEY` in user settings (stored encrypted)
- Results cached in `tavily_cache` table to reduce API calls for repeated queries

## Notes

- The `search` skill sets `force_tool: search_web`, meaning the AI always calls this tool first regardless of the message content.
- Metrics for Tavily usage (call count, success rate, latency) are visible in the Logs → Metrics tab.
