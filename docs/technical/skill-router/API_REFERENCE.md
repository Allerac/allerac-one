# Skill Router - API Reference

Complete API documentation for developers integrating with the skill router.

## SkillsService

Main service class for skill management and detection.

### detectIntent()

Detects the best matching skill for a user message using LLM routing with keyword fallback.

```typescript
async detectIntent(
  message: string,
  skills: Skill[]
): Promise<Skill | null>
```

**Parameters:**

- `message` (string) - User message to analyze
- `skills` (Skill[]) - Available skills to choose from

**Returns:**

- `Skill | null` - Matched skill or null if no match found

**Behavior:**

1. Filters skills with `auto_switch_rules` configured
2. Attempts LLM routing via Ollama (2000ms timeout)
3. Falls back to keyword matching if LLM unavailable
4. Returns first matched skill

**Example:**

```typescript
import { skillsService } from '@/app/services/skills/skills.service';

const message = "vamos programar algo?";
const skills = await skillsService.getUserSkills(userId);
const matchedSkill = await skillsService.detectIntent(message, skills);

if (matchedSkill) {
  console.log(`Matched skill: ${matchedSkill.name}`);
  // Output: "Matched skill: programmer"
} else {
  console.log("No skill matched");
}
```

### getSkillMetadata()

Internal method to extract and cache skill metadata from content.

```typescript
private getSkillMetadata(skill: Skill): SkillMetadata
```

**Parameters:**

- `skill` (Skill) - Skill object to extract metadata from

**Returns:**

- `SkillMetadata` - Parsed metadata with keywords, file_types, etc.

**Note:** This is cached in memory to avoid re-parsing.

---

## SkillMetadataParser

Utility class for parsing YAML frontmatter and matching keywords.

### parseMetadata()

Extracts YAML frontmatter from skill content.

```typescript
static parseMetadata(
  content: string,
  skillName?: string
): SkillMetadata
```

**Parameters:**

- `content` (string) - Full skill content (markdown with YAML frontmatter)
- `skillName` (string, optional) - Skill name for hardcoded keyword fallback

**Returns:**

- `SkillMetadata` - Extracted metadata

```typescript
interface SkillMetadata {
  name?: string;
  keywords?: string[];
  file_types?: string[];
  description?: string;
  category?: string;
}
```

**Example:**

```typescript
import { SkillMetadataParser } from '@/app/services/skills/skill-metadata.parser';

const skillContent = `---
name: programmer
keywords:
  - build
  - código
  - programar
file_types:
  - .js
  - .ts
---

# Programmer

You are a skilled software engineer...`;

const metadata = SkillMetadataParser.parseMetadata(skillContent, 'programmer');
console.log(metadata);
// Output:
// {
//   name: 'programmer',
//   keywords: ['build', 'código', 'programar'],
//   file_types: ['.js', '.ts']
// }
```

### matchesKeywords()

Checks if a message contains any of the keywords.

```typescript
static matchesKeywords(
  message: string,
  keywords?: string[]
): boolean
```

**Parameters:**

- `message` (string) - Message to check
- `keywords` (string[], optional) - Keywords to match against

**Returns:**

- `boolean` - True if any keyword is found

**Matching Logic:**

- Case-insensitive (message and keywords converted to lowercase)
- Substring-based (keyword must be contained in message)
- Short-circuits on first match

**Example:**

```typescript
import { SkillMetadataParser } from '@/app/services/skills/skill-metadata.parser';

SkillMetadataParser.matchesKeywords(
  "vamos programar algo?",
  ["programar", "código", "build"]
); // true

SkillMetadataParser.matchesKeywords(
  "How do I run the server?",
  ["programar", "código"]
); // false

SkillMetadataParser.matchesKeywords(
  "Create a new file",
  ["create", "file"]
); // true (matches "create")
```

### matchesFileTypes()

Checks if a message contains any of the file types.

```typescript
static matchesFileTypes(
  message: string,
  fileTypes?: string[]
): boolean
```

**Parameters:**

- `message` (string) - Message to check
- `fileTypes` (string[], optional) - File extensions to match

**Returns:**

- `boolean` - True if any file type is found

**Example:**

```typescript
import { SkillMetadataParser } from '@/app/services/skills/skill-metadata.parser';

SkillMetadataParser.matchesFileTypes(
  "What's in my index.ts file?",
  [".ts", ".js", ".py"]
); // true (matches ".ts")

SkillMetadataParser.matchesFileTypes(
  "Read the README",
  [".js", ".ts", ".py"]
); // false
```

### SKILL_KEYWORDS

Hardcoded keyword fallback for skills without frontmatter.

```typescript
static readonly SKILL_KEYWORDS: Record<string, string[]> = {
  programmer: [
    'cria', 'criar', 'crie', 'build', 'make', ...
  ],
  'code-analyzer': [
    'analyze', 'analisa', 'review', 'code', ...
  ],
  // ... other skills
};
```

**Purpose:** Provides immediate keyword detection while migrating skill content to include frontmatter.

**When Used:** Falls back to this when `parseMetadata()` doesn't find keywords in content.

---

## Integration Points

### In ChatHandler

The skill router is called from the chat message handler:

**File:** `src/app/services/chat/chat-handler.ts`

```typescript
// Auto-switch skills via LLM intent detection (keyword fallback)
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

### In API Routes

For custom API endpoints that need skill detection:

```typescript
// src/app/api/chat/route.ts
import { skillsService } from '@/app/services/skills/skills.service';

export async function POST(req: Request) {
  const { message, userId, conversationId } = await req.json();
  
  const skills = await skillsService.getUserSkills(userId);
  const detectedSkill = await skillsService.detectIntent(message, skills);
  
  // Use detected skill...
}
```

---

## Type Definitions

### Skill

```typescript
interface Skill {
  id: string;
  user_id: string | null;
  name: string;
  display_name: string;
  description: string;
  content: string;
  category: string;
  learning_enabled: boolean;
  memory_scope: string;
  rag_integration: boolean;
  auto_switch_rules: AutoSwitchRules | null;
  force_tool: string | null;
  version: string;
  license: string;
  verified: boolean;
  shared: boolean;
  install_count: number;
  avg_rating: number | null;
  total_ratings: number;
  created_at: Date;
  updated_at: Date;
}
```

### AutoSwitchRules

```typescript
interface AutoSwitchRules {
  keywords?: string[];
  file_types?: string[];
  time_pattern?: { hour: number };
  confidence_threshold?: number;
  extract_from_content?: boolean;
}
```

### SkillMetadata

```typescript
interface SkillMetadata {
  name?: string;
  keywords?: string[];
  file_types?: string[];
  description?: string;
  category?: string;
}
```

---

## Configuration

### Environment Variables

#### SKILL_ROUTER_MODEL

The Ollama model used for intent detection.

```bash
SKILL_ROUTER_MODEL=qwen2.5:3b
```

**Default:** `qwen2.5:3b`

**Available options:**

- `qwen2.5:3b` - Fast, lightweight, good accuracy
- `mistral:latest` - More accurate, slower
- `neural-chat:latest` - Optimized for chat
- `llama2` - Larger, more capable

**Set in environment:**

```bash
export SKILL_ROUTER_MODEL=mistral:latest
npm run dev
```

#### OLLAMA_BASE_URL

The base URL for the Ollama API.

```bash
OLLAMA_BASE_URL=http://ollama:11434
```

**Default:** `http://ollama:11434`

**For remote Ollama:**

```bash
OLLAMA_BASE_URL=http://my-ollama-server:11434
```

---

## Logging

The skill router outputs detailed logs for debugging:

```
[SkillRouter] detectIntent called with OLLAMA_BASE_URL=http://ollama:11434
[SkillRouter] Found 9 routable skills
[SkillRouter] Attempting LLM routing with model: qwen2.5:3b
[SkillRouter] LLM routed to skill: programmer
```

### Enable Debug Logs

```bash
DEBUG=*:SkillRouter npm run dev
```

### Log Levels

All logs are prefixed with `[SkillRouter]`:

- `Found X routable skills` - Informational
- `Attempting LLM routing` - Informational
- `LLM routed to skill: X` - Success
- `LLM unavailable (error)` - Warning
- `Keyword match: X` - Success (fallback)

---

## Error Handling

### LLM Unavailable

When Ollama is not available, timeout, or returns an error:

```typescript
// The router automatically falls back to keywords
[SkillRouter] LLM unavailable (Connection refused) — falling back to keywords
```

**No error is thrown.** The system gracefully degrades to keyword matching.

### No Matching Skill

When no skill keywords match and LLM is unavailable:

```typescript
const detected = await skillsService.detectIntent(message, skills);
// detected === null
```

The active skill remains unchanged.

### Invalid Skill Data

If skill content is malformed:

```typescript
// parseMetadata() handles gracefully
const metadata = SkillMetadataParser.parseMetadata(invalidContent, 'skillname');
// Returns: { } (empty object)
// Falls back to hardcoded keywords if available
```

---

## Performance

### Caching

Skill metadata is cached in memory on first parse:

```typescript
// src/app/services/skills/skills.service.ts
const skillMetadataCache = new Map<string, SkillMetadata>();
```

**Cache hit:** < 1ms
**Cache miss (parse):** 1-5ms depending on content size

**Cache is not cleared during runtime.** If skills are updated, restart the app.

### Matching Performance

Keyword and file type matching is O(n·k) where:
- n = number of routable skills
- k = keywords per skill

**Typical:** < 1ms for 10 skills with 30 keywords each

### LLM Timeout

The LLM routing has a 2000ms timeout. If Ollama is slower, the request will timeout and fall back to keywords automatically.

---

## Testing

### Unit Test Example

```typescript
import { SkillMetadataParser } from '@/app/services/skills/skill-metadata.parser';

describe('SkillMetadataParser', () => {
  it('should match keywords case-insensitively', () => {
    const matches = SkillMetadataParser.matchesKeywords(
      "PROGRAMAR algo",
      ['programar']
    );
    expect(matches).toBe(true);
  });

  it('should parse YAML frontmatter', () => {
    const content = `---
name: test-skill
keywords:
  - keyword1
  - keyword2
---

# Test Skill`;

    const metadata = SkillMetadataParser.parseMetadata(content);
    expect(metadata.keywords).toEqual(['keyword1', 'keyword2']);
  });
});
```

### Integration Test Example

```typescript
import { skillsService } from '@/app/services/skills/skills.service';

describe('SkillRouter Integration', () => {
  it('should detect programmer skill from message', async () => {
    const skills = [
      { id: '1', name: 'programmer', content: '...' },
      { id: '2', name: 'designer', content: '...' },
    ];

    const detected = await skillsService.detectIntent(
      'vamos programar algo?',
      skills
    );

    expect(detected?.name).toBe('programmer');
  });
});
```

---

## Migration Guide

### Upgrading from JSON to YAML Keywords

**Before:**

```sql
UPDATE skills SET auto_switch_rules = '{
  "keywords": ["word1", "word2"],
  "file_types": [".ts"]
}' WHERE id = '...';
```

**After:**

1. Update skill content to include YAML frontmatter:

```markdown
---
keywords:
  - word1
  - word2
file_types:
  - .ts
---

# Skill Content
```

2. Update database:

```sql
UPDATE skills 
SET auto_switch_rules = '{"extract_from_content": true}'
WHERE id = '...';
```

3. Verify:

```typescript
const skill = await skillsService.getSkillById(skillId);
const metadata = SkillMetadataParser.parseMetadata(skill.content, skill.name);
console.log(metadata.keywords); // Should contain keywords from frontmatter
```
