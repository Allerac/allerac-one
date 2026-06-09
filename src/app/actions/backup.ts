'use server';

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import pool from '@/app/clients/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';

const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';
const BACKUP_FILENAME_PATTERN = /^allerac-backup-[a-zA-Z0-9.-]{1,180}\.sql$/;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const POSTGRES_DUMP_HEADER = 'PostgreSQL database dump';

function isValidBackupFilename(filename: string): boolean {
  return typeof filename === 'string' && BACKUP_FILENAME_PATTERN.test(filename);
}

function databaseConnection() {
  return {
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || '5432',
    database: process.env.POSTGRES_DB || 'allerac',
    user: process.env.POSTGRES_USER || 'allerac',
    password: process.env.POSTGRES_PASSWORD || 'allerac',
  };
}

async function runDatabaseCommand(
  executable: 'pg_dump' | 'psql',
  args: string[],
  options: { outputPath?: string } = {},
): Promise<void> {
  const { password } = databaseConnection();
  const output = options.outputPath ? await fs.open(options.outputPath, 'wx') : undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        env: { ...process.env, PGPASSWORD: password },
        stdio: ['ignore', output?.fd ?? 'ignore', 'pipe'],
      });
      let stderr = '';

      child.stderr?.on('data', (chunk) => {
        if (stderr.length < 8_192) stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${executable} failed${stderr ? `: ${stderr.trim()}` : ''}`));
      });
    });
  } finally {
    await output?.close();
  }
}

async function validateSqlBackup(backupPath: string): Promise<void> {
  const stats = await fs.stat(backupPath);
  if (!stats.isFile() || stats.size === 0 || stats.size > MAX_BACKUP_BYTES) {
    throw new Error('Backup file is empty, too large, or invalid');
  }

  const handle = await fs.open(backupPath, 'r');
  try {
    const sampleSize = Math.min(stats.size, 16 * 1024);
    const sample = Buffer.alloc(sampleSize);
    await handle.read(sample, 0, sampleSize, 0);
    if (!sample.toString('utf8').includes(POSTGRES_DUMP_HEADER)) {
      throw new Error('Backup does not contain a PostgreSQL plain-text dump');
    }
  } finally {
    await handle.close();
  }
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  sizeFormatted: string;
  createdAt: Date;
  createdAtFormatted: string;
}

export interface BackupResult {
  success: boolean;
  message: string;
  backup?: BackupInfo;
}

export interface RestoreResult {
  success: boolean;
  message: string;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date to readable string
 */
function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Ensure backup directory exists
 */
async function ensureBackupDir(): Promise<void> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating backup directory:', error);
  }
}

/**
 * Create a database backup
 */
export async function createBackup(): Promise<BackupResult> {
  await requireCurrentAdmin();
  try {
    await ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `allerac-backup-${timestamp}.sql`;
    const backupPath = path.join(BACKUP_DIR, filename);
    const temporaryPath = `${backupPath}.tmp`;

    const db = databaseConnection();
    try {
      await runDatabaseCommand(
        'pg_dump',
        ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '-F', 'p'],
        { outputPath: temporaryPath },
      );
      await validateSqlBackup(temporaryPath);
      await fs.rename(temporaryPath, backupPath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }

    // Get file stats
    const stats = await fs.stat(backupPath);

    const backup: BackupInfo = {
      filename,
      path: backupPath,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      createdAt: stats.birthtime,
      createdAtFormatted: formatDate(stats.birthtime),
    };

    return {
      success: true,
      message: `Backup created successfully: ${filename}`,
      backup,
    };
  } catch (error: any) {
    console.error('Error creating backup:', error);
    return {
      success: false,
      message: error.message || 'Failed to create backup',
    };
  }
}

/**
 * List all available backups
 */
export async function listBackups(): Promise<BackupInfo[]> {
  await requireCurrentAdmin();
  try {
    await ensureBackupDir();

    const files = await fs.readdir(BACKUP_DIR);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (file.startsWith('allerac-backup-') && file.endsWith('.sql')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filePath);

        backups.push({
          filename: file,
          path: filePath,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.birthtime,
          createdAtFormatted: formatDate(stats.birthtime),
        });
      }
    }

    // Sort by creation date (newest first)
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return backups;
  } catch (error) {
    console.error('Error listing backups:', error);
    return [];
  }
}

/**
 * Delete a backup
 */
export async function deleteBackup(filename: string): Promise<BackupResult> {
  await requireCurrentAdmin();
  try {
    // Validate filename to prevent path traversal
    if (!isValidBackupFilename(filename)) {
      return {
        success: false,
        message: 'Invalid backup filename',
      };
    }

    const backupPath = path.join(BACKUP_DIR, filename);
    await fs.unlink(backupPath);

    return {
      success: true,
      message: `Backup deleted: ${filename}`,
    };
  } catch (error: any) {
    console.error('Error deleting backup:', error);
    return {
      success: false,
      message: error.message || 'Failed to delete backup',
    };
  }
}

/**
 * Restore from a backup
 */
export async function restoreBackup(filename: string): Promise<RestoreResult> {
  await requireCurrentAdmin();
  try {
    // Validate filename to prevent path traversal
    if (!isValidBackupFilename(filename)) {
      return {
        success: false,
        message: 'Invalid backup filename',
      };
    }

    const backupPath = path.join(BACKUP_DIR, filename);

    // Check if backup exists
    try {
      await fs.access(backupPath);
    } catch {
      return {
        success: false,
        message: 'Backup file not found',
      };
    }

    await validateSqlBackup(backupPath);

    const db = databaseConnection();
    await runDatabaseCommand('psql', [
      '-v', 'ON_ERROR_STOP=1',
      '-h', db.host,
      '-p', db.port,
      '-U', db.user,
      '-d', db.database,
      '-f', backupPath,
    ]);

    return {
      success: true,
      message: `Database restored from: ${filename}`,
    };
  } catch (error: any) {
    console.error('Error restoring backup:', error);
    return {
      success: false,
      message: error.message || 'Failed to restore backup',
    };
  }
}

/**
 * Download a backup file (returns the file content as base64)
 */
export async function downloadBackup(filename: string): Promise<{ success: boolean; data?: string; message?: string }> {
  await requireCurrentAdmin();
  try {
    // Validate filename to prevent path traversal
    if (!isValidBackupFilename(filename)) {
      return {
        success: false,
        message: 'Invalid backup filename',
      };
    }

    const backupPath = path.join(BACKUP_DIR, filename);
    const content = await fs.readFile(backupPath);
    const base64 = content.toString('base64');

    return {
      success: true,
      data: base64,
    };
  } catch (error: any) {
    console.error('Error downloading backup:', error);
    return {
      success: false,
      message: error.message || 'Failed to download backup',
    };
  }
}

/**
 * Upload/Import a backup file from user's machine
 */
export async function uploadBackup(base64Content: string, originalFilename: string): Promise<BackupResult> {
  await requireCurrentAdmin();
  try {
    void originalFilename;
    if (
      typeof base64Content !== 'string'
      || base64Content.length > Math.ceil(MAX_BACKUP_BYTES * 4 / 3) + 4
      || !/^[a-zA-Z0-9+/]*={0,2}$/.test(base64Content)
    ) {
      return { success: false, message: 'Invalid or oversized backup' };
    }
    await ensureBackupDir();

    // Generate a new filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `allerac-backup-${timestamp}-imported.sql`;
    const backupPath = path.join(BACKUP_DIR, filename);

    // Decode base64 and write to file
    const content = Buffer.from(base64Content, 'base64');
    if (content.length === 0 || content.length > MAX_BACKUP_BYTES) {
      return { success: false, message: 'Invalid or oversized backup' };
    }
    await fs.writeFile(backupPath, content);

    // Get file stats
    const stats = await fs.stat(backupPath);

    const backup: BackupInfo = {
      filename,
      path: backupPath,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      createdAt: stats.birthtime,
      createdAtFormatted: formatDate(stats.birthtime),
    };

    return {
      success: true,
      message: `Backup imported successfully: ${filename}`,
      backup,
    };
  } catch (error: any) {
    console.error('Error uploading backup:', error);
    return {
      success: false,
      message: error.message || 'Failed to upload backup',
    };
  }
}

/**
 * Get backup stats
 */
export async function getBackupStats(): Promise<{
  totalBackups: number;
  totalSize: string;
  lastBackup: string | null;
}> {
  await requireCurrentAdmin();
  try {
    const backups = await listBackups();
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
    const lastBackup = backups.length > 0 ? backups[0].createdAtFormatted : null;

    return {
      totalBackups: backups.length,
      totalSize: formatBytes(totalSize),
      lastBackup,
    };
  } catch (error) {
    console.error('Error getting backup stats:', error);
    return {
      totalBackups: 0,
      totalSize: '0 B',
      lastBackup: null,
    };
  }
}
