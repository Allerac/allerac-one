# Skill Router - Intent Detection & Auto-Activation

The Skill Router automatically detects user intent and switches to the appropriate skill without manual selection. It uses a two-tier approach: LLM-based routing with keyword fallback.

## Overview

When a user sends a message in a conversation, the router:

1. **Attempts LLM routing** - Uses a lightweight local model (Ollama) to understand the message intent
2. **Falls back to keywords** - If LLM is unavailable, matches keywords directly from skill metadata
3. **Activates the matched skill** - Switches the conversation context to that skill

This ensures skill detection works reliably both online and offline.

## Architecture

```
User Message
    ↓
[SkillRouter.detectIntent()]
    ↓
┌─ Try LLM Routing (Ollama) ────────────────┐
│  • Ask local model: "Which skill applies?"│
│  • Timeout: 2000ms                        │
│  • Model: qwen2.5:3b (configurable)       │
└───────────────────────────────────────────┘
    ↓ (LLM unavailable or timeout)
┌─ Keyword Fallback ────────────────────────┐
│  • Extract skill metadata                 │
│  • Check keywords & file_types            │
│  • Match against message (case-insensitive)
└───────────────────────────────────────────┘
    ↓
[SkillMetadata.matchesKeywords()] or [matchesFileTypes()]
    ↓
Return matched Skill
```

## How Keywords Are Managed

Keywords are stored in two places for flexibility:

### 1. Skill Content Frontmatter (Primary)

Keywords are defined in the YAML frontmatter of skill content:

```markdown
---
name: programmer
keywords:
  - build
  - create
  - código
  - programar
  - programação
file_types:
  - .js
  - .ts
  - .py
---

# Programmer

Your skill content here...
```

When a skill is loaded, `SkillMetadataParser.parseMetadata()` extracts this YAML.

### 2. Hardcoded Fallback (Temporary)

While migrating skill content to include frontmatter, hardcoded keywords provide a fallback:

```typescript
// src/app/services/skills/skill-metadata.parser.ts
static readonly SKILL_KEYWORDS: Record<string, string[]> = {
  programmer: [
    'build', 'create', 'código', 'programar', ...
  ],
  'code-analyzer': [
    'analyze', 'review', 'code', ...
  ],
  // ... other skills
};
```

The parser checks the frontmatter first, then falls back to hardcoded keywords if not found.

## How It Works

### 1. Intent Detection Flow

**File:** `src/app/services/skills/skills.service.ts`

```typescript
async detectIntent(
  message: string,
  skills: Skill[]
): Promise<Skill | null>
```

**Steps:**

1. Filter available skills that have `auto_switch_rules` configured
2. Build LLM prompt listing all available skills
3. Call Ollama with 2000ms timeout
4. Parse LLM response and match against skill names
5. If no match or LLM unavailable, fall back to keyword matching
6. Return the matched skill or null

### 2. Keyword Matching

**File:** `src/app/services/skills/skill-metadata.parser.ts`

```typescript
static matchesKeywords(
  message: string,
  keywords?: string[]
): boolean
```

**Logic:**

- Convert message to lowercase
- Check if any keyword is contained in the message (case-insensitive substring match)
- Return true on first match

**Example:**

```
User: "vamos programar algo?"
Keywords: ["programar", "código", "build", ...]
Match: "programar" found in message → true
```

### 3. Metadata Extraction & Caching

**File:** `src/app/services/skills/skill-metadata.parser.ts`

The `SkillMetadataParser` extracts YAML frontmatter from skill content:

```typescript
static parseMetadata(content: string, skillName?: string): SkillMetadata
```

**Returns:**

```typescript
interface SkillMetadata {
  name?: string;
  keywords?: string[];
  file_types?: string[];
  description?: string;
  category?: string;
}
```

**Caching:** Metadata is cached in memory after first parse to avoid re-parsing the full content on every message.

```typescript
// Global in-memory cache
const skillMetadataCache = new Map<string, SkillMetadata>();
```

## Adding Keywords to a Skill

### Step 1: Add to Skill Content (Recommended)

Edit your skill's markdown content to include keywords in the frontmatter:

```markdown
---
name: my-skill
keywords:
  - keyword1
  - keyword2
  - palavra em português
file_types:
  - .ext1
  - .ext2
---

# My Skill

Your skill description and instructions...
```

### Step 2: (Optional) Add Hardcoded Fallback

If the skill is not yet migrated to include frontmatter, add a temporary fallback:

```typescript
// src/app/services/skills/skill-metadata.parser.ts
static readonly SKILL_KEYWORDS: Record<string, string[]> = {
  'my-skill': [
    'keyword1', 'keyword2', 'palavra em português'
  ],
  // ... other skills
};
```

### Step 3: Test

Type a message with the keyword and verify the skill is auto-activated:

```
User: "I need to keyword1 something"
Router: [SkillRouter] Keyword match: my-skill
Chat: Skill switched to "my-skill"
```

## Configuration

### LLM Routing Model

**Environment Variable:** `SKILL_ROUTER_MODEL`

**Default:** `qwen2.5:3b`

**Location:** `process.env.SKILL_ROUTER_MODEL` in `skills.service.ts`

Change to use a different Ollama model for better or faster routing:

```bash
SKILL_ROUTER_MODEL=mistral:latest npm run dev
```

### Ollama Base URL

**Environment Variable:** `OLLAMA_BASE_URL`

**Default:** `http://ollama:11434`

**Location:** `process.env.OLLAMA_BASE_URL` in `skills.service.ts`

### Timeout

**LLM Timeout:** 2000ms (hardcoded in `skills.service.ts`)

If the LLM doesn't respond within 2 seconds, the router falls back to keywords.

To adjust:

```typescript
// src/app/services/skills/skills.service.ts
const timeout = setTimeout(() => controller.abort(), 2000); // Change this
```

## Database Schema

Skills table includes `auto_switch_rules` (JSON) to mark routable skills:

```sql
ALTER TABLE skills ADD COLUMN auto_switch_rules JSONB;
```

Currently stores:

```json
{
  "extract_from_content": true
}
```

This flag indicates that keywords should be extracted from the skill's content rather than stored as JSON.

## Behavior

### Successful LLM Match

```
[SkillRouter] Found 9 routable skills
[SkillRouter] Attempting LLM routing with model: qwen2.5:3b
[SkillRouter] LLM routed to skill: programmer
```

### LLM Fallback → Keyword Match

```
[SkillRouter] LLM unavailable (timeout) — falling back to keywords
[SkillRouter] Keyword match: programmer
```

### No Match

```
[SkillRouter] Found 0 routable skills
```

or

```
[SkillRouter] No keyword matches found
```

## Supported Languages

The router is language-agnostic. Keywords can be in any language:

**Portuguese (PT-BR):**

```yaml
keywords:
  - programar
  - código
  - criar
  - arquivo
```

**English:**

```yaml
keywords:
  - program
  - code
  - create
  - file
```

**Mixed:**

```yaml
keywords:
  - programar
  - program
  - código
  - code
```

Messages are matched case-insensitively with substring matching, so "Programar algo" will match keyword "programar".

## Performance Considerations

1. **Metadata Caching**: Skill metadata is cached after first parse to avoid re-parsing large content
2. **LLM Timeout**: 2000ms is a reasonable timeout for local Ollama models. Adjust based on your hardware
3. **Keyword Matching**: O(n·k) where n = routable skills, k = keywords per skill. Very fast (< 1ms typically)

## Future Improvements

- [ ] Machine learning model training on user interactions
- [ ] Semantic similarity matching (embeddings)
- [ ] Skill confidence scores
- [ ] A/B testing different models
- [ ] Admin UI for keyword management

## Related Files

- `src/app/services/skills/skills.service.ts` - Main router logic
- `src/app/services/skills/skill-metadata.parser.ts` - YAML parsing and matching
- `src/app/services/chat/chat-handler.ts` - Calls detectIntent
- `src/database/migrations/022_skill_programmer.sql` - Skill definitions

## Debugging

### Enable Verbose Logging

Set `DEBUG=*` environment variable:

```bash
DEBUG=* npm run dev
```

This will show all `[SkillRouter]` log messages with detailed routing decisions.

### Check Skill Keywords

Query the database:

```sql
SELECT name, auto_switch_rules, LEFT(content, 200) 
FROM skills 
WHERE auto_switch_rules IS NOT NULL;
```

### Test Keyword Matching Locally

```typescript
import { SkillMetadataParser } from '@/app/services/skills/skill-metadata.parser';

const keywords = ['programar', 'build', 'code'];
const message = "vamos programar algo?";

const matches = SkillMetadataParser.matchesKeywords(message, keywords);
console.log(matches); // true
```
