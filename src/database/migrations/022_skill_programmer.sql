-- Seed: Programmer skill (public, available to all users)
-- Force-calls execute_shell so the model actually runs code instead of describing it.
-- Uses INSERT+UPDATE pattern because ON CONFLICT doesn't work with NULL user_id.

DO $$
DECLARE
  skill_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  skill_content TEXT := $SKILL$# Programmer

You are a skilled software engineer with access to a real Linux shell environment.
When the user asks you to create files, write code, set up a project, install packages, or run commands — **do it directly** using `execute_shell`. Do not explain the steps. Do not show the commands as text. Just execute.

## Executor environment

- Shell: bash (stateless — each call is independent)
- Available: `node`, `npm`, `python3`, `git`, `curl`, and standard Unix tools
- **Always chain commands with `&&` in a single call** — `cd` does not persist between calls
- **Projects go in `/workspace/projects/`** — system will automatically inject your user ID into paths
- Write multi-line file content with heredoc:
  ```
  cat > file.js << 'EOF'
  ...file content here...
  EOF
  ```
  Never use `echo` with single quotes for code — it breaks on quotes inside the content.
- Do NOT use `npx` scaffolding tools — use `npm init -y && npm install` instead.

## Handling errors

If a command fails, read the error output and fix it in the next call. Do not ask the user for help with errors — just fix them.

## After creating a project

The executor is sandboxed — any server you start is NOT accessible from the user's browser.
After creating a project, tell the user:
- Where the files are (e.g. `/workspace/projects/my-app/`)
- How to run it on their own machine (e.g. `cd ~/projects/my-app && npm start`)
$SKILL$;
BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name      = '🧑‍💻 Programmer',
      description       = 'Executes code, creates projects, and sets up environments using the shell executor. Automatically activated when you ask to build, create, or run something.',
      content           = skill_content,
      force_tool        = 'execute_shell',
      auto_switch_rules = '{"keywords": ["cria", "criar", "crie", "build", "make", "projeto", "project", "setup", "instala", "install", "escreve", "escrever", "write", "code", "código", "script", "app", "aplicação", "application", "node", "python", "react", "express", "api", "server", "servidor", "arquivo", "file", "pasta", "folder", "directory"]}',
      verified          = true,
      shared            = true,
      updated_at        = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content, category,
      force_tool, auto_switch_rules, verified, shared, version,
      learning_enabled, memory_scope, rag_integration
    ) VALUES (
      skill_id,
      NULL,
      'programmer',
      '🧑‍💻 Programmer',
      'Executes code, creates projects, and sets up environments using the shell executor. Automatically activated when you ask to build, create, or run something.',
      skill_content,
      'development',
      'execute_shell',
      '{"keywords": ["cria", "criar", "crie", "build", "make", "projeto", "project", "setup", "instala", "install", "escreve", "escrever", "write", "code", "código", "script", "app", "aplicação", "application", "node", "python", "react", "express", "api", "server", "servidor", "arquivo", "file", "pasta", "folder", "directory"]}',
      true,
      true,
      '1.0.0',
      false,
      'user',
      false
    );
  END IF;
END $$;
