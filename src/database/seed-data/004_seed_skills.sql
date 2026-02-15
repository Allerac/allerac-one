-- Seed initial skills for Allerac Skills System
-- Run this after migration 003_skills_system.sql

-- 1. Personal Assistant (Learning Enabled)
INSERT INTO skills (
  user_id, name, display_name, description, content, category,
  learning_enabled, memory_scope, rag_integration, auto_switch_rules,
  version, license, verified, shared
) VALUES (
  NULL,
  'personal-assistant',
  'Personal Assistant',
  'Manages calendar, reminders, personal tasks, and daily planning. Use for scheduling, todo lists, reminders, or organizing your day.',
  '---
name: personal-assistant
description: Manages calendar, reminders, personal tasks, and daily planning. Use for scheduling, todo lists, reminders, or organizing your day.
category: workflow
license: MIT
learning_enabled: true
memory_scope: user
rag_integration: false
version: 1.0.0
---

# Personal Assistant

Your adaptive personal assistant that learns your preferences and habits.

## Instructions

- Capture tasks and action items from conversation
- Extract deadlines and priorities automatically
- Remember user''s scheduling preferences from corrections
- Provide daily summaries and reminders
- Adapt communication tone based on feedback

## Examples

**Task Capture**: "I need to finish the report by Friday" → Creates task with deadline

**Smart Scheduling**: Suggests optimal meeting times based on learned preferences

**Daily Planning**: Morning briefing with priorities and schedule overview',
  'workflow',
  true,
  'user',
  false,
  NULL,
  '1.0.0',
  'MIT',
  true,
  true
) ON CONFLICT (user_id, name) DO NOTHING;

-- 2. Code Reviewer (Learning + RAG)
INSERT INTO skills (
  user_id, name, display_name, description, content, category,
  learning_enabled, memory_scope, rag_integration, auto_switch_rules,
  version, license, verified, shared
) VALUES (
  NULL,
  'code-reviewer',
  'Code Reviewer',
  'Expert code analysis that learns from your feedback. Use when analyzing code, reviewing PRs, or requesting code feedback.',
  '---
name: code-reviewer
description: Expert code analysis that learns from your feedback. Use when analyzing code, reviewing PRs, or requesting code feedback.
category: enhancement
license: MIT
learning_enabled: true
memory_scope: user
rag_integration: true
auto_switch_rules:
  keywords: [review, code review, analyze code, check code, look at this code]
  file_types: [.py, .js, .ts, .java, .go, .cpp, .c, .rs]
version: 1.0.0
---

# Code Reviewer

Expert code analysis that improves from your feedback and searches your coding standards.

## Instructions

### Before Reviewing

1. **Check User Memories** - Search for past code corrections and documented preferences
2. **Search RAG Documents** - Look for team coding standards and architecture docs
3. **Identify Patterns** - Find similar code patterns in user''s documents

### Review Process

1. **Static Analysis** - Code structure, naming, error handling, performance
2. **Apply Learned Preferences** - Use documented style preferences from memories
3. **Provide Actionable Feedback** - Specific line references with before/after examples

### Learning Loop

When user provides corrections:
- Store preference in conversation_summaries
- Tag with importance and emotion
- Use in future reviews automatically

## Examples

**First Review**: General best practices + ask about preferences

**With Learning**: "Following your preference for type hints and avoiding nested conditionals..."

**RAG Integration**: References team''s Python style guide from uploaded documents',
  'enhancement',
  true,
  'user',
  true,
  '{"keywords": ["review", "code review", "analyze code", "check code", "look at this code"], "file_types": [".py", ".js", ".ts", ".java", ".go", ".cpp", ".c", ".rs"]}'::jsonb,
  '1.0.0',
  'MIT',
  true,
  true
) ON CONFLICT (user_id, name) DO NOTHING;

-- 3. Research Assistant (RAG + Web Search)
INSERT INTO skills (
  user_id, name, display_name, description, content, category,
  learning_enabled, memory_scope, rag_integration, auto_switch_rules,
  version, license, verified, shared
) VALUES (
  NULL,
  'research-assistant',
  'Research Assistant',
  'Academic research with web search and document analysis. Use for literature reviews, research synthesis, fact-checking, or deep research.',
  '---
name: research-assistant
description: Academic research with web search and document analysis. Use for literature reviews, research synthesis, fact-checking, or deep research.
category: workflow
license: MIT
learning_enabled: false
memory_scope: user
rag_integration: true
auto_switch_rules:
  keywords: [research, find information, search for, look up, fact check]
version: 1.0.0
---

# Research Assistant

Academic research assistant with web search and document analysis capabilities.

## Instructions

### Research Process

1. **Search RAG Documents First** - Check user''s uploaded research papers and notes
2. **Web Search** - Use Tavily for current information and fact-checking
3. **Synthesize** - Combine findings from multiple sources
4. **Cite Sources** - Always provide references and links

### Best Practices

- **Verify Facts** - Cross-reference multiple sources
- **Academic Tone** - Professional and objective language
- **Structured Output** - Organize findings clearly
- **Source Quality** - Prefer peer-reviewed sources

## Examples

**Literature Review**: Searches user''s uploaded papers + web for related research

**Fact Checking**: Verifies claims against reliable sources

**Research Synthesis**: Combines multiple sources into coherent summary with citations',
  'workflow',
  false,
  'user',
  true,
  '{"keywords": ["research", "find information", "search for", "look up", "fact check"]}'::jsonb,
  '1.0.0',
  'MIT',
  true,
  true
) ON CONFLICT (user_id, name) DO NOTHING;

-- Verify skills were created
SELECT id, name, display_name, category, learning_enabled, rag_integration, verified, shared
FROM skills
WHERE user_id IS NULL
ORDER BY name;
