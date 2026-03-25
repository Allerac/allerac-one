# Spec: Workspace API Routes

**Files:** `src/app/api/workspace/file/route.ts`, `tree/route.ts`, `delete/route.ts`, `run/route.ts`
**Priority:** 🔴 Critical — path traversal = any user can read/write/delete any file on the host

## What to mock
- `AuthService.validateSession` — return a fake user `{ id: 'user-abc' }` for authenticated tests
- `ShellTool.execute` — return controlled stdout/stderr without hitting the executor
- For 401 tests — `validateSession` returns null

## Security: path traversal (most important)

These must all return 400, never execute:
```
/workspace/projects/user-abc/../../etc/passwd
/workspace/projects/user-abc/../other-user/secret.txt
/workspace/projects/                          (bare root)
/workspace/projects/user-abc                  (user root itself — for delete)
```

Each API must validate that the resolved path starts with `/workspace/projects/{userId}/`.

## `GET /api/workspace/file`

- Returns `{ content, language, path }` for a valid file within user scope
- Detects language from extension (`.ts` → `typescript`, `.py` → `python`, etc.)
- Returns 401 if not authenticated
- Returns 400 for path traversal attempts
- Returns 413 if file exceeds 500 KB
- Returns 422 for binary files (contains null bytes)

## `PUT /api/workspace/file`

- Overwrites file content via executor (base64 encode/decode)
- Returns 401 if not authenticated
- Returns 400 for path traversal attempts
- Returns 400 if `content` is not a string

## `GET /api/workspace/tree`

- Returns nested directory structure for the user's project
- Never includes files outside user scope
- Returns 401 if not authenticated
- Returns 400 for path traversal attempts

## `DELETE /api/workspace/delete`

- Deletes the target folder
- Returns 400 if path resolves to the user root itself (prevents wiping all projects)
- Returns 400 for path traversal attempts
- Returns 401 if not authenticated

## `POST /api/workspace/run`

- Executes command with `cwd` set to user project root
- Returns `{ stdout, stderr, exitCode, duration_ms }`
- Returns 400 if `cwd` is outside user scope
- Returns 400 if `command` is missing
- Returns 401 if not authenticated

## Notes
- All path validation uses `path.resolve()` — tests should include symlink-style tricks (`..`, `.`, `//`)
- The user ID in paths comes from the session, never from the request body/query
