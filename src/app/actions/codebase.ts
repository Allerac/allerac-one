'use server';

import fs from 'fs/promises';
import path from 'path';

// Whitelist of directories the programmer can read from
const READABLE_BASE_PATHS = [
  '/home/gianclaudiocarella/wsp/',
  '/workspace',
  '/tmp',
];

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

function isPathAllowed(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return READABLE_BASE_PATHS.some(base =>
    normalized.startsWith(base) || normalized === base
  );
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
  try {
    // Log the received path for debugging
    console.log(`[readProjectFiles] Received path: "${filePath}"`);

    // Security: Validate path
    if (!isPathAllowed(filePath)) {
      console.log(`[readProjectFiles] Path not allowed: "${filePath}"`);
      return {
        success: false,
        requestedPath: filePath,
        type: 'file',
        files: [],
        error: `Access denied: Path must be under ${READABLE_BASE_PATHS.join(' or ')}`,
      };
    }

    const normalized = path.normalize(filePath);
    console.log(`[readProjectFiles] Normalized path: "${normalized}"`);

    // Check if path exists
    let stat;
    try {
      stat = await fs.stat(normalized);
      console.log(`[readProjectFiles] Path exists, isFile: ${stat.isFile()}, isDirectory: ${stat.isDirectory()}`);
    } catch (err) {
      console.log(`[readProjectFiles] Path not found error: ${(err as Error).message}`);
      return {
        success: false,
        requestedPath: filePath,
        type: 'file',
        files: [],
        error: `Path not found: ${filePath}`,
      };
    }

    if (stat.isFile()) {
      // Single file
      const content = await readFile(normalized);
      return {
        success: true,
        requestedPath: filePath,
        type: 'file',
        files: [content],
      };
    } else if (stat.isDirectory()) {
      // Directory: list relevant files
      const files = await listDirectory(normalized);
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
