# Domain: Recipes

**Slug:** `recipes`  
**Route:** `/recipes`  
**Icon:** 🍳  
**Status:** Inactive  
**Default Skill:** `chef` (`skills/chef.md`)

## Purpose

Chef and nutrition assistant. Generates recipes with exact quantities, suggests meal plans, handles dietary restrictions (vegetarian, vegan, gluten-free), and provides nutritional guidance.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/recipes/page.tsx` |
| Skill | `skills/chef.md` |

## Tools Available

| Tool | Description |
|------|-------------|
| `search_web` | Web search for recipes and nutritional info |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## External Integrations

None. Uses web search for current recipes, trends, and nutritional data.

## Notes

- Currently **inactive** — not shown in the hub by default.
- To activate: insert a record in the `domains` table with `slug = 'recipes'` and `is_active = true`, and assign the domain to the relevant users in `user_domain_access`.
- No custom UI panel — Pattern A (chat only).
