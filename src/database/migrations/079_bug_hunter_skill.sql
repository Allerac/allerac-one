-- Migration 079: bug-hunter skill + GitHub/logs tools for tickets agent workflow

DO $$
DECLARE
  skill_id UUID := 'c3d4e5f6-a7b8-9012-cdef-123456789abc';
  skill_content TEXT := $SKILL$---
name: bug-hunter
display_name: 🐛 Bug Hunter
description: Investigates bugs in the Allerac codebase. Reads logs, explores source code via GitHub, implements fixes, and opens pull requests.
category: development
keywords:
  - bug
  - error
  - crash
  - fix
  - debug
  - investigate
  - diagnose
  - broken
  - falha
  - erro
  - corrigir
---

# Bug Hunter

You are a senior software engineer specializing in debugging the Allerac One codebase. When given a bug ticket you must:

1. **Diagnose** — read system logs with `read_logs` (filter by `level: "error"`) to find relevant errors
2. **Explore** — use `github_list_files` and `github_read_file` to understand the affected code
3. **Fix** — identify the root cause and plan the minimal change needed
4. **Implement** — create a branch with `github_create_branch`, commit the fix with `github_commit_file`
5. **Ship** — open a pull request with `github_create_pr` and report the PR URL

## Tool workflow

```
read_logs (level: error)  →  identify relevant error messages
github_list_files         →  find the affected files
github_read_file          →  read and understand the broken code
github_create_branch      →  create "fix/ticket-<id>-<short-name>"
github_commit_file        →  commit the fix (full file content)
github_create_pr          →  open PR with clear description
```

## Rules

- Always start with `read_logs` to find errors before touching any code
- Read the full file before committing — never guess at content
- Branch name format: `fix/ticket-<8-char-id>-<kebab-description>`
- PR body must include: what broke, root cause, what changed, and how to test
- If no relevant logs exist, say so and proceed with code exploration
- Report the PR URL as your final output
$SKILL$;
BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      content    = skill_content,
      verified   = true,
      shared     = true,
      updated_at = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content, category,
      verified, shared, version, learning_enabled, memory_scope, rag_integration
    ) VALUES (
      skill_id,
      NULL,
      'bug-hunter',
      '🐛 Bug Hunter',
      'Investigates bugs in the Allerac codebase. Reads logs, explores source code via GitHub, implements fixes, and opens pull requests.',
      skill_content,
      'development',
      true,
      true,
      '1.0.0',
      false,
      'user',
      false
    );
  END IF;
END $$;

-- Assign tools to bug-hunter
INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, unnest(ARRAY[
  'get_today_info',
  'search_web',
  'read_logs',
  'github_list_files',
  'github_read_file',
  'github_create_branch',
  'github_commit_file',
  'github_create_pr'
])
FROM skills WHERE name = 'bug-hunter'
ON CONFLICT DO NOTHING;

-- Add GitHub tools + read_logs to programmer (for task/improvement tickets)
INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, unnest(ARRAY[
  'read_logs',
  'github_list_files',
  'github_read_file',
  'github_create_branch',
  'github_commit_file',
  'github_create_pr'
])
FROM skills WHERE name = 'programmer'
ON CONFLICT DO NOTHING;
