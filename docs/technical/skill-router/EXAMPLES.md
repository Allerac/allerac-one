# Skill Router - Examples & Use Cases

Practical examples of how the skill router detects and activates skills.

## Example 1: The Programmer Skill

### Skill Definition

The programmer skill triggers on code-related keywords:

```yaml
---
name: programmer
keywords:
  - cria
  - criar
  - crie
  - build
  - make
  - projeto
  - project
  - setup
  - instala
  - install
  - escreve
  - escrever
  - write
  - code
  - código
  - script
  - app
  - aplicação
  - application
  - node
  - python
  - react
  - express
  - api
  - server
  - servidor
  - arquivo
  - file
  - pasta
  - folder
  - directory
  - programar
  - programação
  - programa
  - programming
---

# Programmer

You are a skilled software engineer...
```

### Example Interactions

**User Input:** "vamos programar algo?"

```
1. Message received: "vamos programar algo?"
2. Available routable skills: programmer, code-analyzer, search, etc.
3. Try LLM routing: qwen2.5:3b (Ollama unavailable)
4. [SkillRouter] LLM unavailable (timeout) — falling back to keywords
5. Extract metadata for 'programmer': keywords = [cria, criar, programar, ...]
6. Check keywords: "programar" found in message ✓
7. [SkillRouter] Keyword match: programmer
8. Activate skill: programmer
9. Response comes from programmer skill context
```

**User Input:** "create a Node.js server"

```
1. Message: "create a Node.js server"
2. Extract metadata for 'programmer'
3. Check keywords: "create" matches keyword "crie"? No.
   But "server" matches keyword "server" ✓
4. [SkillRouter] Keyword match: programmer
5. Skill activated
```

**User Input:** "How many files in /tmp?"

```
1. Message: "How many files in /tmp?"
2. Extract metadata for 'programmer'
3. Check keywords: "file" found ✓
4. [SkillRouter] Keyword match: programmer
5. Programmer skill handles the file system query
```

## Example 2: Adding a New "Designer" Skill

### Step 1: Create the Skill Content

File: `src/app/skills/designer.md`

```markdown
---
name: designer
display_name: 🎨 Designer
description: Helps with design, layout, UI/UX, and visual feedback on projects.
category: creative
keywords:
  - design
  - UI
  - UX
  - layout
  - interface
  - visual
  - estética
  - design gráfico
  - logo
  - color
  - font
  - style
  - look
  - aparência
file_types:
  - .figma
  - .sketch
  - .xd
  - .css
  - .scss
---

# Designer

You are an expert UI/UX designer...
```

### Step 2: Add to Database

Create migration: `src/database/migrations/023_skill_designer.sql`

```sql
DO $$
DECLARE
  skill_id UUID := 'c1d2e3f4-g5h6-7890-ijkl-mnopqrstuvwx';
BEGIN
  INSERT INTO skills (
    id, user_id, name, display_name, description, content, category,
    auto_switch_rules, verified, shared, version,
    learning_enabled, memory_scope, rag_integration
  ) VALUES (
    skill_id,
    NULL,
    'designer',
    '🎨 Designer',
    'Helps with design, layout, UI/UX, and visual feedback on projects.',
    (SELECT pg_read_file('/app/skills/designer.md')),
    'creative',
    '{"extract_from_content": true}',
    true,
    true,
    '1.0.0',
    false,
    'user',
    false
  );
END $$;
```

### Step 3: Test It

User messages that trigger the designer skill:

| User Input | Matched Keyword | Status |
|-----------|-----------------|--------|
| "Design a logo" | design | ✓ Activates |
| "Make it look better" | look | ✓ Activates |
| "Fix the UI" | UI | ✓ Activates |
| "estou criando um design gráfico" | design gráfico | ✓ Activates |
| "What should the color be?" | color | ✓ Activates |

## Example 3: Language-Specific Detection

### Portuguese-Heavy Skill

Keywords in Portuguese for Portuguese-speaking users:

```yaml
---
name: health-coach
keywords:
  - saúde
  - exercício
  - treino
  - dieta
  - alimentação
  - fitness
  - peso
  - energia
  - sleep
  - sono
  - cansaço
  - dor
  - lesão
  - recovery
  - recuperação
---
```

User: "Como melhorar minha saúde?"
→ Matches keyword "saúde" → Activates health-coach

### English-Heavy Skill

```yaml
---
name: researcher
keywords:
  - research
  - study
  - investigate
  - find
  - look up
  - source
  - reference
  - paper
  - journal
  - academic
---
```

User: "Find research on machine learning"
→ Matches keyword "research" → Activates researcher

### Bilingual Skill

```yaml
---
name: writer
keywords:
  - write
  - escrever
  - content
  - conteúdo
  - article
  - artigo
  - post
  - poema
  - story
  - história
  - blog
---
```

User: "Escrever um blog post sobre IA"
→ Matches keyword "escrever" → Activates writer

## Example 4: File Type Detection

### Code Analyzer Skill

```yaml
---
name: code-analyzer
keywords:
  - analyze
  - review
  - check
  - code
file_types:
  - .ts
  - .tsx
  - .js
  - .jsx
  - .py
  - .java
  - .go
---
```

User: "What's in my main.ts file?"
→ Matches file type ".ts" → Activates code-analyzer

## Example 5: Skill Switching in Conversation

### Scenario: Multi-skill Conversation

```
User: "Create a React app"
→ [SkillRouter] Keyword match: programmer
→ [ChatHandler] Switched to skill: programmer

User: "Make the UI look better"
→ [SkillRouter] Keyword match: designer
→ [ChatHandler] Switched to skill: designer

User: "Add some tests"
→ [SkillRouter] Keyword match: code-analyzer
→ [ChatHandler] Switched to skill: code-analyzer
```

Each message can trigger a different skill based on intent.

## Example 6: Debugging Keyword Matching

### Manual Test

In your TypeScript code:

```typescript
import { SkillMetadataParser } from '@/app/services/skills/skill-metadata.parser';

const skillContent = `---
name: programmer
keywords:
  - programar
  - código
  - build
---

# Programmer...`;

const metadata = SkillMetadataParser.parseMetadata(skillContent, 'programmer');
console.log(metadata.keywords);
// Output: ["programar", "código", "build"]

const matches1 = SkillMetadataParser.matchesKeywords(
  "vamos programar algo?",
  metadata.keywords
);
console.log(matches1); // true

const matches2 = SkillMetadataParser.matchesKeywords(
  "How do I run the server?",
  metadata.keywords
);
console.log(matches2); // false (no matching keywords)
```

### Database Check

```sql
-- List all skills with their keywords
SELECT 
  s.name,
  s.description,
  SUBSTR(s.content, 1, 300) as content_preview
FROM skills s
WHERE s.auto_switch_rules->>'extract_from_content' = 'true'
ORDER BY s.name;

-- Example output:
-- name          | description                              | content_preview
-- programmer    | Executes code, creates projects...       | ---\nname: programmer\nkeywords:\n  - cria\n...
-- code-analyzer | Read and analyze code...                 | # Code Analyzer\n\n...
```

## Example 7: LLM vs Keyword Fallback

### When LLM Works (Ollama Available)

```
Message: "I need to build a website"

[SkillRouter] Found 9 routable skills
[SkillRouter] Attempting LLM routing with model: qwen2.5:3b
[SkillRouter] LLM response: "programmer"
[SkillRouter] LLM routed to skill: programmer
```

### When LLM Fails → Keyword Fallback

```
Message: "I need to build a website"

[SkillRouter] Found 9 routable skills
[SkillRouter] Attempting LLM routing with model: qwen2.5:3b
[SkillRouter] LLM unavailable (Connection timeout) — falling back to keywords
[SkillRouter] Keyword fallback matched: programmer
```

Both paths activate the programmer skill, but keyword fallback ensures reliability offline.

## Best Practices

### 1. Be Specific with Keywords

❌ Bad: `keywords: [a, the, do, it]` (too generic)

✓ Good: `keywords: [program, code, build, script]` (specific to skill)

### 2. Include Multiple Languages

```yaml
keywords:
  - analyze       # English
  - analisa       # Portuguese
  - review        # English variant
  - revisão       # Portuguese variant
```

### 3. Use Common Abbreviations

```yaml
keywords:
  - code
  - src
  - api
  - ui
  - json
```

Users often use abbreviations.

### 4. Add Related Concepts

```yaml
keywords:
  - design       # Main concept
  - ui           # Related
  - ux           # Related
  - layout       # Related
  - visual       # Related
```

### 5. Include Both Verbs and Nouns

```yaml
keywords:
  - test         # Verb (what users might ask)
  - tests        # Noun (noun form)
  - testing      # Gerund (gerund form)
```

## Troubleshooting

### Skill Not Activating

1. Check that skill has `auto_switch_rules` set:
   ```sql
   SELECT name, auto_switch_rules FROM skills WHERE name = 'my-skill';
   ```

2. Verify keywords in content:
   ```sql
   SELECT LEFT(content, 500) FROM skills WHERE name = 'my-skill';
   ```

3. Test keyword matching manually:
   ```typescript
   const matches = SkillMetadataParser.matchesKeywords(
     "your message here",
     ["keyword1", "keyword2"]
   );
   console.log(matches);
   ```

### Keyword Not Matching

Remember:
- Matching is **case-insensitive**
- Matching is **substring-based** (contains, not equals)
- Special characters are preserved

```
Message: "Programar em Python"
Keyword: "programar"
Match: ✓ "programar" is substring of message (after lowercasing)

Message: "I'll program later"
Keyword: "programar"
Match: ✗ "programar" is NOT substring (only "program" is)
```

### Wrong Skill Activated

1. Check skill order in database
2. Add more specific keywords
3. Adjust LLM model for better accuracy

```bash
SKILL_ROUTER_MODEL=neural-chat:latest npm run dev
```
