import path from 'path';

export const WORKSPACE_BASE = '/workspace/projects';

export function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function getUserWorkspaceRoot(userId: string): string {
  return `${WORKSPACE_BASE}/${userId}`;
}

export function resolveUserWorkspacePath(userId: string, input?: string | null): string | null {
  const userRoot = getUserWorkspaceRoot(userId);
  const raw = (input || '').trim() || userRoot;
  const resolved = path.resolve(raw);

  if (resolved !== userRoot && !resolved.startsWith(`${userRoot}/`)) {
    return null;
  }

  return resolved;
}

export function resolveUserWorkspaceFilePath(userId: string, input?: string | null): string | null {
  const userRoot = getUserWorkspaceRoot(userId);
  const resolved = resolveUserWorkspacePath(userId, input);
  if (!resolved || resolved === userRoot) return null;
  return resolved;
}

export function normalizeWorkspaceReferences(userId: string, value: string): string {
  const userRoot = getUserWorkspaceRoot(userId);
  const placeholder = '__ALLERAC_USER_WORKSPACE_ROOT__';
  return value
    .replace(/\/workspace\/projects\/[a-f0-9-]{36}(?=\/|\s|$|["'])/gi, placeholder)
    .replace(/\/workspace\/projects(?=\/|\s|$|["'])/g, placeholder)
    .replaceAll(placeholder, userRoot);
}

export function resolveShellCwd(userId: string, cwd?: string | null): string | null {
  const raw = (cwd || '').trim();
  if (!raw || raw === WORKSPACE_BASE) {
    return getUserWorkspaceRoot(userId);
  }
  return resolveUserWorkspacePath(userId, raw);
}
