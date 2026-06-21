// Pure tool definitions — no Node.js/server imports.

export const GITHUB_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Read the content of a file from the Allerac One GitHub repository (Allerac/allerac-one). IMPORTANT: when reading a file you are about to edit on a branch, always pass ref: "<branch-name>" to read the current branch version. After making an edit with github_edit_file, re-read the file with the branch ref before making another edit to the same file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the repo root (e.g. "src/app/page.tsx").',
          },
          ref: {
            type: 'string',
            description: 'Branch, tag, or commit SHA to read from. Defaults to "main". Always set this to your working branch name when editing files.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_files',
      description: 'List files and directories in the Allerac One GitHub repository. Use this to explore the project structure before reading or editing files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list (omit or pass "" for the repo root).',
          },
          ref: {
            type: 'string',
            description: 'Branch, tag, or commit SHA. Defaults to "main".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_branch',
      description: 'Create a new branch in the Allerac One repository. Always create a branch before committing changes.',
      parameters: {
        type: 'object',
        properties: {
          branch: {
            type: 'string',
            description: 'Name for the new branch (e.g. "fix/ticket-123-login-bug" or "feat/ticket-456-add-filter").',
          },
          from_branch: {
            type: 'string',
            description: 'Base branch to branch from. Defaults to "main".',
          },
        },
        required: ['branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_commit_file',
      description: 'Create or update a file in a branch of the Allerac One repository. IMPORTANT: you MUST provide the full file content in the "content" field — not a diff, not a summary, the entire file text. Read the file first with github_read_file, apply your changes in memory, then pass the complete modified file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the repo root.',
          },
          content: {
            type: 'string',
            description: 'The FULL text of the file after your changes. Must be the complete file, not a partial update or diff.',
          },
          message: {
            type: 'string',
            description: 'Commit message describing the change.',
          },
          branch: {
            type: 'string',
            description: 'Branch to commit to (must already exist — create it with github_create_branch first).',
          },
        },
        required: ['path', 'content', 'message', 'branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_replace_lines',
      description: 'Replace a range of lines in a file on a branch. PREFERRED tool for editing files — use the line numbers from github_read_file output. After each edit, re-read the file with ref set to the branch to get updated line numbers before making further edits.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to repo root.',
          },
          start_line: {
            type: 'number',
            description: 'First line to replace (1-indexed, inclusive), from github_read_file output.',
          },
          end_line: {
            type: 'number',
            description: 'Last line to replace (1-indexed, inclusive), from github_read_file output.',
          },
          new_content: {
            type: 'string',
            description: 'Replacement text for the line range. Use actual newlines or \\n to separate lines.',
          },
          branch: {
            type: 'string',
            description: 'Branch to commit to (must already exist).',
          },
          message: {
            type: 'string',
            description: 'Commit message (optional).',
          },
        },
        required: ['path', 'start_line', 'end_line', 'new_content', 'branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_edit_file',
      description: 'Edit a file by exact text find/replace. Use github_replace_lines instead when possible — it is more reliable. Only use this tool if the pattern to find is unique and short (under 5 lines). The server searches the branch version of the file for the exact "find" text and replaces all occurrences with "replace".',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the repo root (e.g. "src/app/tickets/TicketsClient.tsx").',
          },
          find: {
            type: 'string',
            description: 'The exact text to find in the file. Must match character-for-character including whitespace and newlines. Copy it verbatim from github_read_file output.',
          },
          replace: {
            type: 'string',
            description: 'The new text to replace the found text with.',
          },
          message: {
            type: 'string',
            description: 'Commit message describing the change (optional — defaults to "chore: edit <path>").',
          },
          branch: {
            type: 'string',
            description: 'Branch to commit to (must already exist).',
          },
        },
        required: ['path', 'find', 'replace', 'branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_pr',
      description: 'Open a pull request in the Allerac One repository. Call this after committing all changes to a branch.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Pull request title (concise, under 70 characters).',
          },
          body: {
            type: 'string',
            description: 'Pull request description in markdown. Include what changed, why, and how to test.',
          },
          head: {
            type: 'string',
            description: 'The branch containing the changes (source branch).',
          },
          base: {
            type: 'string',
            description: 'The branch to merge into. Defaults to "main".',
          },
        },
        required: ['title', 'body', 'head'],
      },
    },
  },
];

export const GITHUB_TOOL_NAMES = GITHUB_TOOL_DEFINITIONS.map(
  (t) => t.function.name,
);
