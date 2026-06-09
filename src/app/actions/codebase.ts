'use server';

import fs from 'fs/promises';
import path from 'path';
import { requireCurrentUser } from '@/app/lib/auth-session';
import {
  getUserWorkspaceRoot,
  resolveUserWorkspacePath,
} from '@/app/lib/workspace-paths';

// File extensions to include when listing directories
const RELEVANT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',
  '.cs', '.java', '.py', '.go', '.rs',
  '.md', '.txt', '.json', '.yaml', '.yml',
  '.html', '.css', '.sql',
  'Dockerfile', '.dockerfile',
  'package.json', '.env.example', 'README.md',
  'tsconfig.json', 'jest.config.js',
];

// Directories to skip when listing
const SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'bin', 'obj',
  '.next', 'coverage', '__pycache__', '.gradle', 'target',
  '.venv', 'venv', '.idea', '.vscode',
];

interface FileContent {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  content?: string;
  language?: string;
  error?: string;
}

interface ReadProjectResult {
  success: boolean;
  requestedPath: string;
  type: 'file' | 'directory';
  files: FileContent[];
  error?: string;
}

async function resolveReadablePath(userId: string, filePath: string): Promise<string | null> {
  const resolved = resolveUserWorkspacePath(userId, filePath);
  if (!resolved) return null;

  try {
    const [realRoot, realPath] = await Promise.all([
      fs.realpath(getUserWorkspaceRoot(userId)),
      fs.realpath(resolved),
    ]);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) {
      return null;
    }
    return realPath;
  } catch {
    return null;
  }
}

function isRelevantFile(filename: string): boolean {
  // Check exact matches first (Dockerfile, package.json, README.md)
  if (['Dockerfile', 'package.json', 'README.md', '.env.example'].includes(filename)) {
    return true;
  }
  // Check extensions
  return RELEVANT_EXTENSIONS.some(ext => filename.endsWith(ext));
}

function shouldSkipDir(dirname: string): boolean {
  return SKIP_DIRS.includes(dirname);
}

function guessLanguage(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.cs': 'csharp',
    '.java': 'java',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.html': 'html',
    '.css': 'css',
    '.sql': 'sql',
  };
  return map[ext];
}

async function readFile(filePath: string, maxSize = 50000): Promise<FileContent> {
  try {
    const stat = await fs.stat(filePath);

    if (stat.size > maxSize) {
      return {
        path: filePath,
        name: path.basename(filePath),
        type: 'file',
        size: stat.size,
        error: `File too large (${stat.size} bytes, max ${maxSize}). Use a text editor to view.`,
      };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return {
      path: filePath,
      name: path.basename(filePath),
      type: 'file',
      size: stat.size,
      content,
      language: guessLanguage(filePath),
    };
  } catch (error) {
    return {
      path: filePath,
      name: path.basename(filePath),
      type: 'file',
      error: `Failed to read: ${(error as Error).message}`,
    };
  }
}

async function listDirectory(dirPath: string, maxFiles = 20): Promise<FileContent[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const relevant: FileContent[] = [];

    for (const entry of entries) {
      if (relevant.length >= maxFiles) break;
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) {
          continue;
        }
        // Add directory entry (but don't recurse)
        relevant.push({
          path: path.join(dirPath, entry.name),
          name: entry.name,
          type: 'directory',
        });
      } else {
        if (isRelevantFile(entry.name)) {
          const fullPath = path.join(dirPath, entry.name);
          const fileContent = await readFile(fullPath);
          relevant.push(fileContent);
        }
      }
    }

    return relevant;
  } catch (error) {
    return [
      {
        path: dirPath,
        name: path.basename(dirPath),
        type: 'directory',
        error: `Failed to list directory: ${(error as Error).message}`,
      },
    ];
  }
}

export async function readProjectFiles(filePath: string): Promise<ReadProjectResult> {
  const user = await requireCurrentUser();
  try {
    if (typeof filePath !== 'string' || filePath.length > 4_096) {
      return {
        success: false,
        requestedPath: String(filePath),
        type: 'file',
        files: [],
        error: 'Invalid path',
      };
    }

    const readablePath = await resolveReadablePath(user.id, filePath);
    if (!readablePath) {
      return {
        success: false,
        requestedPath: filePath,
        type: 'file',
        files: [],
        error: 'Access denied or path not found',
      };
    }

    const stat = await fs.stat(readablePath);
    if (stat.isFile()) {
      // Single file
      const content = await readFile(readablePath);
      return {
        success: true,
        requestedPath: filePath,
        type: 'file',
        files: [content],
      };
    } else if (stat.isDirectory()) {
      // Directory: list relevant files
      const files = await listDirectory(readablePath);
      return {
        success: true,
        requestedPath: filePath,
        type: 'directory',
        files,
      };
    } else {
      return {
        success: false,
        requestedPath: filePath,
        type: 'file',
        files: [],
        error: 'Path is neither a file nor directory',
      };
    }
  } catch (error) {
    return {
      success: false,
      requestedPath: filePath,
      type: 'file',
      files: [],
      error: `Error reading project: ${(error as Error).message}`,
    };
  }
}
