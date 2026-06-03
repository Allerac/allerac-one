# Domain: Finance

**Slug:** `finance`  
**Route:** `/finance`  
**Icon:** 💰  
**Status:** Inactive  
**Default Skill:** `finance` (`skills/finance.md`)

## Purpose

Personal finance advisor. Helps with budgeting, investment comparison, retirement projections, tax efficiency, and insurance evaluation. Supports both Brazilian instruments (Tesouro Direto, CDB, FII) and international ones (ETFs, 401k, ISA).

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/finance/page.tsx` |
| Client layout | `src/app/finance/FinanceClient.tsx` |
| Skill | `skills/finance.md` |

## Tools Available

| Tool | Description |
|------|-------------|
| `search_web` | Web search for market data, rates, and financial news |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## External Integrations

None. Uses web search for current market data and rates.

## Notes

- Currently **inactive** — not shown in the hub by default.
- To activate: insert a record in the `domains` table with `slug = 'finance'` and `is_active = true`, and assign the domain to the relevant users in `user_domain_access`.
- Has a `FinanceClient.tsx` layout wrapper (Pattern B) even though there is no custom panel — this was likely left from an earlier design iteration.
