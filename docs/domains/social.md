# Domain: Social

**Slug:** `social`  
**Route:** `/social`  
**Icon:** 📸  
**Status:** Active  
**Default Skill:** `social` (`skills/social.md`)

## Purpose

Instagram management assistant. The AI helps draft captions and hashtags, generates reel scripts, and publishes posts directly to a connected Instagram Business account via the Meta Graph API.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/social/page.tsx` |
| Instagram tool | `src/app/tools/instagram.tool.ts` |
| Graph API service | `src/app/services/instagram/instagram-graph.service.ts` |
| Credentials service | `src/app/services/instagram/instagram-credentials.service.ts` |
| Actions | `src/app/actions/instagram.ts` |
| Skill | `skills/social.md` |

## Tools Available

| Tool | Description |
|------|-------------|
| `update_instagram_form` | Update the draft post form (caption, tags, price, image_url) |
| `instagram_publish_post` | Publish the current draft to Instagram |
| `instagram_get_profile` | Fetch connected account info |
| `instagram_get_recent_posts` | List recent posts (1–12) |
| `search_web` | Web search via Tavily |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## External Integrations

- **Instagram Graph API** (Meta) — requires a connected Business or Creator account
- **OAuth 2.0 flow** — stored in `instagram_credentials` table (encrypted)
- **Image hosting** — Imgur (default) or Azure Blob Storage for image URLs

## DB Tables

| Table | Purpose |
|-------|---------|
| `instagram_accounts` | Connected IG business accounts |
| `instagram_credentials` | Encrypted OAuth tokens |
| `user_instagram_account` | User ↔ account mapping |

## Known Constraints

- Instagram API requires **Business or Creator** account (personal accounts are not supported).
- Comment trigger (auto-reply to comments with a keyword) requires **Meta app verification** — currently blocked pending business verification.
- Images must be hosted at a public URL before publishing (Imgur or Azure Blob).

## Settings

Users configure their Instagram connection via the Instagram settings panel in the domain (OAuth flow). The domain also supports per-product reference settings (`instagram_ref_settings` table) for tagging products in posts.
