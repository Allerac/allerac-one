# Skill Router

Automatic skill detection and activation based on user intent. When a user sends a message, the system attempts to detect which skill should handle it and switches context automatically.

## How It Works

The skill router runs in two stages:

### Stage 1: LLM Routing (Fast, Optional)

Attempts to use a local Ollama model to classify the message intent.

```
User Message
    ↓
Ask Ollama: "Which skill best matches this message?"
    ↓
If Ollama responds → Match skill name
If Ollama unavailable/timeout → Fall through to Stage 2
```

**Configuration:**
- Model: `qwen2.5:3b` (configurable via `SKILL_ROUTER_MODEL` env var)
- Timeout: 2000ms
- Base URL: `http://ollama:11434` (configurable via `OLLAMA_BASE_URL`)

**Status:** In production, Ollama often times out or is unavailable, so Stage 2 usually handles detection.

### Stage 2: Keyword Fallback (Reliable)

If LLM routing fails, matches keywords directly from the database.

```
For each skill:
  Get keywords from database (auto_switch_rules.keywords)
  If message contains any keyword (case-insensitive substring match):
    → Activate that skill
```

**This is the main detection method currently in use.**

## Database Schema

Skills are stored in the `skills` table:

```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY,
  name VARCHAR UNIQUE,           -- e.g. "programmer"
  display_name VARCHAR,          -- e.g. "🧑‍💻 Programmer"
  description TEXT,              -- skill purpose
  content TEXT,                  -- full skill prompt/instructions
  auto_switch_rules JSONB,       -- detection config
  ...
);
```

The `auto_switch_rules` column stores:

```json
{
  "keywords": [
    "programar",
    "código",
    "build",
    "create",
    ...
  ]
}
```

## Adding a New Skill

### Step 1: Create the Skill in Database

Add a migration file `src/database/migrations/NNN_skill_<name>.sql`:

```sql
DO $$
DECLARE
  skill_id UUID := 'your-uuid-here';
  skill_content TEXT := $SKILL$# Your Skill Name

Instructions and prompt here...
$SKILL$;
BEGIN
  INSERT INTO skills (
    id, user_id, name, display_name, description, 
    content, category, auto_switch_rules, 
    verified, shared, version
  ) VALUES (
    skill_id,
    NULL,
    'your-skill-name',
    '🎯 Your Skill Name',
    'One-line description of what this skill does.',
    skill_content,
    'category-name',
    '{"keywords": ["word1", "word2", "palavra1"]}'::jsonb,
    true,
    true,
    '1.0.0'
  );
END $$;
```

### Step 2: Add Keywords

The `auto_switch_rules` JSON should contain keywords that trigger this skill:

```json
{
  "keywords": [
    "design",
    "ui",
    "layout",
    "interface",
    "css",
    "estética",
    "visual"
  ]
}
```

**Guidelines:**
- Use lowercase
- Include both English and Portuguese (PT-BR) variants
- Include common abbreviations and variations
- More keywords = better detection, but be specific (avoid too-generic words)

### Step 3: Run Migration

The migration runs automatically on app startup via `src/database/init.sql`.

### Step 4: Test

Restart the app and test that messages with your keywords activate the skill:

```
User: "I need to design the UI"
→ [SkillRouter] Keyword fallback matched: your-skill-name
→ Skill activated
```

## Current Limitations

### Detection Is Not Perfect

The keyword matching is simple substring matching. This means:

**❌ What doesn't work well:**
- Semantic understanding (synonyms not covered by keywords)
- Context awareness (same word in different contexts)
- Phrase-based detection (only single keywords)
- Typos or misspellings

**✅ What works:**
- Exact keyword matches (case-insensitive)
- Multiple keywords per skill
- Multi-language keywords

### Examples of Detection Failures

| User Input | Expected Skill | What Happens | Why |
|-----------|---|---|---|
| "vamos programar?" | programmer | ✅ Works | "programar" in keywords |
| "can you code this?" | programmer | ❌ May not work | "code" is keyword, but detection is inconsistent |
| "I need UI help" | designer | ❌ May not work | "ui" is keyword, but only checked if skill has it |
| "write a function" | programmer | ✅ Works | "write" and "function" in keywords |
| "fix the bug" | programmer | ❌ Doesn't work | "fix" and "bug" not in keywords |

## Project Structure

```
src/
├── app/
│   ├── services/
│   │   ├── skills/
│   │   │   └── skills.service.ts          ← Main router logic
│   │   └── chat/
│   │       └── chat-handler.ts            ← Calls router
│   │
│   ├── actions/
│   │   └── chat/                          ← Server actions
│   │
│   └── api/
│       └── chat/
│           └── route.ts                   ← API endpoint
│
└── database/
    ├── migrations/
    │   └── NNN_skill_*.sql                ← Skill definitions
    └── seed-data/
        └── *.sql                          ← Initial skills
```

## Code Locations

### 1. Main Router Logic

**File:** `src/app/services/skills/skills.service.ts`

**Class:** `SkillsService`

**Function:** `async detectIntent(message: string, skills: Skill[]): Promise<Skill | null>`
- **Lines:** ~327-426
- **Purpose:** Detect which skill should handle the message
- **Flow:**
  1. Filter skills with `auto_switch_rules` configured
  2. Try LLM routing via Ollama (timeout: 2000ms)
  3. Fall back to keyword matching
  4. Return matched skill or null

**Code excerpt:**
```typescript
// Line 327-335: Filter routable skills
const routableSkills = skills.filter(s => s.auto_switch_rules);
if (routableSkills.length === 0) {
  return null;
}

// Line 356-393: LLM routing attempt
try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0, num_predict: 200 },
    }),
    signal: controller.signal,
  });
  // ... handle response
} catch (err: any) {
  console.log(`[SkillRouter] LLM unavailable (${err.message}) — falling back to keywords`);
}

// Line 395-425: Keyword fallback
for (const skill of routableSkills) {
  if (!skill.auto_switch_rules) continue;
  const rules = skill.auto_switch_rules as any;

  // Check keywords
  if (rules.keywords && Array.isArray(rules.keywords)) {
    const hasKeyword = rules.keywords.some((kw: string) =>
      message.toLowerCase().includes(kw.toLowerCase())
    );
    if (hasKeyword) {
      console.log(`[SkillRouter] Keyword fallback matched: ${skill.name}`);
      return skill;
    }
  }
}

return null;
```

### 2. Chat Integration

**File:** `src/app/services/chat/chat-handler.ts`

**Function:** `async handleChatMessage(message: string, conversationId: string, config: ChatHandlerConfig, ...): Promise<ChatHandlerResult>`
- **Lines:** ~55-220
- **Purpose:** Main chat message handler that calls skill router

**Router call (Lines ~96-108):**
```typescript
// Auto-switch skills via intent detection
{
  const availableSkills = botId
    ? await skillsService.getBotSkills(botId)
    : await skillsService.getUserSkills(userId);
  
  const candidates = availableSkills.filter(
    s => s.id !== activeSkill?.id
  );
  
  const detected = await skillsService.detectIntent(message, candidates);
  
  if (detected) {
    await skillsService.activateSkill(
      detected.id,
      convId,
      userId,
      'auto',
      message,
      botId
    );
    activeSkill = detected;
    console.log(`[ChatHandler] Auto-switched to skill: ${detected.name}`);
  }
}
```

### 3. API Entry Point

**File:** `src/app/api/chat/route.ts`

**Function:** `export async function POST(req: Request)`
- **Purpose:** HTTP API endpoint for chat
- **Flow:**
  1. Parse request
  2. Call `handleChatMessage()`
  3. Return response

### 4. Skill Definitions

**Migrations:** `src/database/migrations/NNN_skill_*.sql`
- Example: `src/database/migrations/022_skill_programmer.sql`
- Each skill is defined as a database INSERT/UPDATE
- Includes: name, description, content (prompt), auto_switch_rules (keywords)

**Example structure:**
```sql
DO $$
DECLARE
  skill_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  skill_content TEXT := $SKILL$
    # Programmer
    [skill prompt/instructions here]
  $SKILL$;
BEGIN
  INSERT INTO skills (
    id, user_id, name, display_name, description,
    content, category, auto_switch_rules,
    verified, shared, version,
    learning_enabled, memory_scope, rag_integration
  ) VALUES (
    skill_id,
    NULL,
    'programmer',
    '🧑‍💻 Programmer',
    'Executes code, creates projects, and sets up environments...',
    skill_content,
    'development',
    '{"keywords": ["programar", "código", "build", ...]}'::jsonb,
    true,
    true,
    '1.0.0',
    false,
    'user',
    false
  );
END $$;
```

**Seed data:** `src/database/seed-data/004_seed_skills.sql`
- Initial skills loaded on first app startup

## Key Data Structures

### Skill Record

**Table:** `skills`

```typescript
interface Skill {
  id: string;                           // UUID
  user_id: string | null;               // NULL = system skill
  name: string;                         // e.g. "programmer"
  display_name: string;                 // e.g. "🧑‍💻 Programmer"
  description: string;                  // Purpose of skill
  content: string;                      // Full prompt/instructions
  category: string;                     // e.g. "development"
  auto_switch_rules: AutoSwitchRules | null;  // Detection config
  force_tool: string | null;            // Force a specific tool
  verified: boolean;                    // System/verified skill
  shared: boolean;                      // Public or private
  version: string;                      // Skill version
  learning_enabled: boolean;            // Can learn from user
  memory_scope: string;                 // "user", "conversation"
  rag_integration: boolean;             // Can access documents
  created_at: Date;
  updated_at: Date;
}
```

### AutoSwitchRules

```typescript
interface AutoSwitchRules {
  keywords?: string[];                  // Words that trigger this skill
  file_types?: string[];                // File extensions that trigger
  // Note: Currently only keywords are used
}
```

**Example:**
```json
{
  "keywords": [
    "programar",
    "programação",
    "programa",
    "programming",
    "código",
    "code",
    "build",
    "create",
    "execute",
    ...
  ]
}
```

## How to Trace a Detection

### 1. Check Logs

```bash
# Watch skill router logs
docker logs allerac-app 2>&1 | grep SkillRouter

# Example output:
# [SkillRouter] detectIntent called with OLLAMA_BASE_URL=http://ollama:11434
# [SkillRouter] Found 9 routable skills
# [SkillRouter] Attempting LLM routing with model: qwen2.5:3b
# [SkillRouter] LLM unavailable (This operation was aborted) — falling back to keywords
# [SkillRouter] Keyword fallback matched: programmer
```

### 2. Query Database

```bash
# See all skills with their keywords
docker exec allerac-db psql -U postgres -d allerac -c \
  "SELECT name, auto_switch_rules FROM skills;"

# See keywords for specific skill
docker exec allerac-db psql -U postgres -d allerac -c \
  "SELECT auto_switch_rules->>'keywords' FROM skills WHERE name = 'programmer';"
```

### 3. Manual Test

Add temporary debug logs to `src/app/services/skills/skills.service.ts`:

```typescript
// In keyword fallback section (line ~395)
console.error(`[DEBUG] Checking ${routableSkills.length} skills`);
for (const skill of routableSkills) {
  const rules = skill.auto_switch_rules as any;
  console.error(`[DEBUG] Skill: ${skill.name}, keywords: ${rules.keywords?.slice(0, 3).join(', ')}`);
  
  if (rules.keywords && Array.isArray(rules.keywords)) {
    const hasKeyword = rules.keywords.some((kw: string) =>
      message.toLowerCase().includes(kw.toLowerCase())
    );
    console.error(`[DEBUG] ${skill.name} match: ${hasKeyword}`);
  }
}
```

Then rebuild and check logs.

## Improving Skill Detection

### Short Term

Add more keywords to each skill based on common user queries:

```bash
# View current keywords
docker exec allerac-db psql -U postgres -d allerac \
  -c "SELECT auto_switch_rules FROM skills WHERE name = 'programmer';"

# Update keywords
# Edit migration file and re-run, or SQL UPDATE manually
UPDATE skills SET auto_switch_rules = 
  '{"keywords": [...]}'::jsonb 
WHERE name = 'programmer';
```

### Medium Term

Implement smarter detection:
- Fuzzy matching (handle typos)
- Synonym expansion ("code" → "program", "develop")
- N-gram matching (multi-word phrases)
- Confidence scoring (which skill is MOST likely)

### Long Term

Use embeddings for semantic matching:
- Convert keywords to embeddings
- Convert user message to embedding
- Find closest skill by semantic similarity
- Would handle synonyms, context, etc.

## Configuration

### Environment Variables

```bash
# Ollama model for LLM routing (unused in practice)
SKILL_ROUTER_MODEL=qwen2.5:3b

# Ollama server URL
OLLAMA_BASE_URL=http://ollama:11434
```

### Hardcoded Settings

Located in `src/app/services/skills/skills.service.ts`:

```typescript
// LLM routing timeout (ms)
const timeout = setTimeout(() => controller.abort(), 2000);
```

## Testing

### Manual Test

1. Send a message with a skill keyword
2. Check logs for:
   ```
   [SkillRouter] LLM unavailable (...) — falling back to keywords
   [SkillRouter] Keyword fallback matched: skill-name
   ```
3. Verify skill switched in chat UI

### Debug Logs

Enable verbose logging to see detection details:

```bash
docker logs allerac-app 2>&1 | grep SkillRouter
```

## Future Roadmap

- [ ] Semantic embeddings-based matching
- [ ] Fuzzy keyword matching
- [ ] Confidence scoring (when multiple skills match)
- [ ] User feedback loop (learn from corrections)
- [ ] Skill metadata UI (manage keywords without migrations)
- [ ] A/B testing different models
- [ ] Performance metrics (which skills are used most)
