import {
  getUserWorkspaceRoot,
  normalizeWorkspaceReferences,
  quoteShellArg,
  resolveShellCwd,
  resolveUserWorkspaceFilePath,
  resolveUserWorkspacePath,
} from '@/app/lib/workspace-paths';

describe('workspace-paths', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  it('returns the user workspace root', () => {
    expect(getUserWorkspaceRoot(userId)).toBe(`/workspace/projects/${userId}`);
  });

  it('allows the workspace root as cwd', () => {
    expect(resolveUserWorkspacePath(userId, `/workspace/projects/${userId}`)).toBe(`/workspace/projects/${userId}`);
  });

  it('allows paths inside the user workspace', () => {
    expect(resolveUserWorkspacePath(userId, `/workspace/projects/${userId}/app/src`)).toBe(`/workspace/projects/${userId}/app/src`);
  });

  it('rejects paths outside the user workspace', () => {
    expect(resolveUserWorkspacePath(userId, '/tmp')).toBeNull();
    expect(resolveUserWorkspacePath(userId, '/etc/passwd')).toBeNull();
  });

  it('rejects path traversal outside the workspace', () => {
    expect(resolveUserWorkspacePath(userId, `/workspace/projects/${userId}/../../other`)).toBeNull();
  });

  it('rejects another user workspace', () => {
    expect(resolveUserWorkspacePath(userId, '/workspace/projects/22222222-2222-4222-8222-222222222222/app')).toBeNull();
  });

  it('requires file paths to be below the workspace root', () => {
    expect(resolveUserWorkspaceFilePath(userId, `/workspace/projects/${userId}`)).toBeNull();
    expect(resolveUserWorkspaceFilePath(userId, `/workspace/projects/${userId}/README.md`)).toBe(`/workspace/projects/${userId}/README.md`);
  });

  it('normalizes generic workspace references to the current user root', () => {
    expect(normalizeWorkspaceReferences(userId, 'cd /workspace/projects && ls')).toBe(`cd /workspace/projects/${userId} && ls`);
    expect(normalizeWorkspaceReferences(userId, 'cat /workspace/projects/22222222-2222-4222-8222-222222222222/app/file.ts')).toBe(
      `cat /workspace/projects/${userId}/app/file.ts`
    );
  });

  it('resolves shell cwd after normalizing workspace references', () => {
    expect(resolveShellCwd(userId, '/workspace/projects')).toBe(`/workspace/projects/${userId}`);
  });

  it('rejects another user workspace as shell cwd', () => {
    expect(resolveShellCwd(userId, '/workspace/projects/22222222-2222-4222-8222-222222222222/app')).toBeNull();
  });

  it('quotes shell arguments containing single quotes', () => {
    expect(quoteShellArg("/workspace/project's files")).toBe(
      "'/workspace/project'\\''s files'"
    );
  });
});
