export { GITHUB_TOOL_DEFINITIONS, GITHUB_TOOL_NAMES } from './github.tool.definitions';

const GITHUB_REPO = 'Allerac/allerac-one';
const GITHUB_API = 'https://api.github.com';

interface GithubFile {
  content: string;
  sha: string;
  path: string;
}

interface GithubEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

interface GithubBranch {
  branch: string;
  sha: string;
}

interface GithubCommit {
  commit_sha: string;
  path: string;
}

interface GithubPR {
  pr_number: number;
  url: string;
  title: string;
}

export class GithubTool {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async apiFetch(path: string, options?: RequestInit): Promise<any> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} on ${path}: ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async readFile(path: string, ref?: string): Promise<GithubFile> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await this.apiFetch(`/repos/${GITHUB_REPO}/contents/${path}${query}`);
    if (Array.isArray(data)) {
      throw new Error(`${path} is a directory — use github_list_files instead.`);
    }
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha, path: data.path };
  }

  async listFiles(path?: string, ref?: string): Promise<GithubEntry[]> {
    const p = path?.replace(/^\//, '') ?? '';
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await this.apiFetch(`/repos/${GITHUB_REPO}/contents/${p}${query}`);
    const items: any[] = Array.isArray(data) ? data : [data];
    return items.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size,
    }));
  }

  async createBranch(branch: string, fromBranch = 'main'): Promise<GithubBranch> {
    const ref = await this.apiFetch(`/repos/${GITHUB_REPO}/git/ref/heads/${fromBranch}`);
    const sha: string = ref.object.sha;

    try {
      await this.apiFetch(`/repos/${GITHUB_REPO}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });
    } catch (err: any) {
      if (err.message?.includes('422')) {
        return { branch, sha };
      }
      throw err;
    }
    return { branch, sha };
  }

  async commitFile(
    path: string,
    content: string,
    message: string,
    branch: string,
  ): Promise<GithubCommit> {
    // Auto-fetch existing SHA so we can update existing files
    let existingSha: string | undefined;
    try {
      const existing = await this.apiFetch(
        `/repos/${GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      );
      if (!Array.isArray(existing)) existingSha = existing.sha;
    } catch {
      // File doesn't exist yet — create it
    }

    const coAuthor = '\n\nCo-authored-by: Allerac One <allerac-one@users.noreply.github.com>';
    const fullMessage = message.includes('Co-authored-by:') ? message : message + coAuthor;
    const body: Record<string, unknown> = {
      message: fullMessage,
      content: Buffer.from(content).toString('base64'),
      branch,
    };
    if (existingSha) body.sha = existingSha;

    const data = await this.apiFetch(`/repos/${GITHUB_REPO}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    return { commit_sha: data.commit.sha, path };
  }

  async editFile(
    path: string,
    find: string,
    replace: string,
    branch: string,
    message?: string,
  ): Promise<GithubCommit & { replaced: number }> {
    const file = await this.readFile(path, branch);

    // Strip line-number prefixes if the LLM copied from numbered output (e.g. "   1: code")
    const stripLineNums = (s: string) => s.replace(/^\s*\d+: /gm, '');

    // Try variants: exact → unescape \n → strip line numbers → both
    const candidates = [
      find,
      find.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, ''),
      stripLineNums(find),
      stripLineNums(find.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '')),
    ];

    let pattern = find;
    let count = 0;
    for (const candidate of candidates) {
      const c = file.content.split(candidate).length - 1;
      if (c > 0) { pattern = candidate; count = c; break; }
    }

    if (count === 0) {
      throw new Error(`Pattern not found in ${path} on branch ${branch}. Make sure to copy the exact text from github_read_file output (use ref: "${branch}" to read the current branch version).`);
    }

    const actualReplace = stripLineNums(replace).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '');
    const newContent = file.content.split(pattern).join(actualReplace);
    const commitMsg = (message || `chore: edit ${path}`) + '\n\nCo-authored-by: Allerac One <allerac-one@users.noreply.github.com>';
    const result = await this.commitFileWithSha(path, newContent, commitMsg, branch, file.sha);
    return { ...result, replaced: count };
  }

  async replaceLines(
    path: string,
    startLine: number,
    endLine: number,
    newContent: string,
    branch: string,
    message?: string,
  ): Promise<GithubCommit & { replaced_lines: number }> {
    const file = await this.readFile(path, branch);
    const lines = file.content.split('\n');
    const total = lines.length;
    if (startLine < 1 || endLine > total || startLine > endLine) {
      throw new Error(`Line range ${startLine}-${endLine} is out of bounds (file has ${total} lines).`);
    }
    const unescaped = newContent.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const newLines = unescaped.split('\n');
    const updated = [...lines.slice(0, startLine - 1), ...newLines, ...lines.slice(endLine)];
    const commitMsg = (message || `chore: edit ${path} L${startLine}-${endLine}`) + '\n\nCo-authored-by: Allerac One <allerac-one@users.noreply.github.com>';
    const result = await this.commitFileWithSha(path, updated.join('\n'), commitMsg, branch, file.sha);
    return { ...result, replaced_lines: endLine - startLine + 1 };
  }

  private async commitFileWithSha(
    path: string,
    content: string,
    message: string,
    branch: string,
    sha: string,
  ): Promise<GithubCommit> {
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha,
    };
    const data = await this.apiFetch(`/repos/${GITHUB_REPO}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return { commit_sha: data.commit.sha, path };
  }

  async createPR(
    title: string,
    body: string,
    head: string,
    base = 'main',
  ): Promise<GithubPR> {
    const data = await this.apiFetch(`/repos/${GITHUB_REPO}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, body, head, base }),
    });
    return { pr_number: data.number, url: data.html_url, title: data.title };
  }
}

export function buildGithubTools(githubToken: string) {
  const tool = new GithubTool(githubToken);

  return {
    github_read_file: async (args: { path: string; ref?: string }) => {
      const file = await tool.readFile(args.path, args.ref);
      const lines = file.content.split('\n');
      // Return with line numbers for reference, original content for editing
      const numbered = lines.map((l, i) => `${String(i + 1).padStart(4)}: ${l}`).join('\n');
      return { path: file.path, sha: file.sha, line_count: lines.length, content: numbered };
    },

    github_list_files: async (args: { path?: string; ref?: string }) =>
      tool.listFiles(args.path, args.ref),

    github_create_branch: async (args: { branch: string; from_branch?: string }) =>
      tool.createBranch(args.branch, args.from_branch),

    github_commit_file: async (args: {
      path: string;
      content: string;
      message: string;
      branch: string;
    }) => {
      if (!args.content) {
        throw new Error('content is required: pass the full modified file text, not a diff or summary');
      }
      return tool.commitFile(args.path, args.content, args.message, args.branch);
    },

    github_replace_lines: async (args: {
      path: string;
      start_line: number;
      end_line: number;
      new_content: string;
      branch: string;
      message?: string;
    }) => tool.replaceLines(args.path, args.start_line, args.end_line, args.new_content, args.branch, args.message),

    github_edit_file: async (args: {
      path: string;
      find: string;
      replace: string;
      message?: string;
      branch: string;
    }) => tool.editFile(args.path, args.find, args.replace, args.branch, args.message),

    github_create_pr: async (args: {
      title: string;
      body: string;
      head: string;
      base?: string;
    }) => tool.createPR(args.title, args.body, args.head, args.base),
  };
}
