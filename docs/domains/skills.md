# Skills

A **skill** is the AI's identity and capability bundle for a domain. It defines *who the AI is* (system prompt) and *what it can do* (tools). Skills are decoupled from domains — a skill can be improved independently, and an admin can reassign it to a different domain without touching code.

## Concept

```
Skill
├── System Prompt   — defines personality, expertise, tone, rules
└── Tools           — defines available capabilities (web search, shell, APIs…)
```

A domain points to a skill as its default. A conversation activates a skill. The user interacts with an AI that has a specific identity and a specific set of actions available.

## System Skills

System skills are loaded from YAML files in `/skills/` at startup and synced to the database. They are shared across all users.

| Skill | Domain default | Description |
|---|---|---|
| `programmer` | code | Senior software engineer with shell access |
| `chef` | recipes | Professional chef and nutritionist |
| `finance` | finance | Financial advisor |
| `health` | health | Health & wellness coach with Garmin data access |
| `writer` | write | Content creator and copywriter |
| `social` | social | Instagram and social media manager |
| `analyst` | — | Data analyst |
| `search` | — | Web research specialist |
| `code-analyzer` | — | Code review and analysis |

## Tool Assignment

Tools are assigned per skill in the `skill_tools` table. The chat route loads the active skill's tools from the database at request time — there is no hardcoded tool filtering logic.

```sql
CREATE TABLE skill_tools (
  skill_id  UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  PRIMARY KEY (skill_id, tool_name)
);
```

### Available Tools

| Tool | Group | Description |
|---|---|---|
| `get_today_info` | Core | Current date, time and timezone |
| `search_web` | Core | Web search via Tavily |
| `execute_shell` | Dev | Bash execution in sandboxed environment |
| `get_health_summary` | Health | Aggregated health metrics (steps, sleep…) |
| `get_health_metrics` | Health | Detailed metrics for a date range |
| `get_daily_snapshot` | Health | All metrics for a single day |
| `get_garmin_status` | Health | Check Garmin device connection status |
| `get_recent_activities` | Health | Recent workouts from Garmin |
| `update_instagram_form` | Instagram | Update the post draft form |
| `instagram_publish_post` | Instagram | Publish a post to Instagram |
| `instagram_get_profile` | Instagram | Fetch account profile info |
| `instagram_get_recent_posts` | Instagram | Get recent posts |

### Default assignments

```
programmer   → get_today_info, search_web, execute_shell
health       → get_today_info, search_web, + all Health tools
social       → get_today_info, search_web, + all Instagram tools
chef         → get_today_info, search_web
finance      → get_today_info, search_web
writer       → get_today_info, search_web
analyst      → get_today_info, search_web
```

## Domain → Skill binding

The binding between a domain and its default skill is stored in `domain_skill_defaults` and managed by the admin from the hub.

```
domain_slug  →  skill_id
code         →  programmer
recipes      →  chef
finance      →  finance
health       →  health
write        →  writer
social       →  social
```

When a user starts a new conversation in a domain, the default skill is automatically activated. The user can manually activate a different skill for that conversation from the skill picker in the chat input.

## Admin management

Admins manage skills from **Hub → Start → Domains**:

1. Select a domain and choose its default skill from the dropdown
2. Click the edit icon to open the skill editor
3. Edit the **system prompt** and toggle **tools** with checkboxes
4. Save — changes take effect on the next conversation

Skills and tool assignments are fully hot-configurable without redeployment.

## Chat route flow

```
User message
    ↓
Load active skill for conversation
    ↓
Load skill's tools from skill_tools table
    ↓
Filter TOOLS array to allowed names
    ↓
LLM call with skill system prompt + allowed tools
```

## User instructions layer

The skill's system prompt is the base layer. On top of it, each user can write personal instructions per domain (stored in `user_domain_instructions`). These are injected into the context before the conversation, allowing users to personalise behaviour without modifying the skill itself.

```
[skill system prompt]
[user domain instructions]
[conversation memory]
[RAG context]
[user message]
```
