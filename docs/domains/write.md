# Domain: Write

**Slug:** `write`  
**Route:** `/write`  
**Icon:** ✍️  
**Status:** Active  
**Default Skill:** `writer` (`skills/writer.md`)

## Purpose

Content creation assistant focused on LinkedIn posts, technical articles, founder narratives, and product storytelling. The AI adapts its tone and language to match the user's voice.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/write/page.tsx` |
| Skill | `skills/writer.md` |

## Tools Available

| Tool | Description |
|------|-------------|
| `search_web` | Web search for current context, examples, and references |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## External Integrations

None. Uses web search for current events and trend references.

## Skill Focus Areas

- LinkedIn posts (technical, product, founder perspective)
- Long-form technical articles
- Hook/headline variations
- Tone adaptation (formal → informal → conversational)
- Rewriting and editing existing content
- Multilingual (adapts to the user's language automatically)

## Notes

- No custom UI panel — Pattern A (chat only).
- The writer skill targets a "founder / 1992 UI, 2025 intelligence" voice — opinionated, clear, not corporate.
