'use server';

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import pool from '@/app/clients/db';

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';

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
  try {
    await ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `allerac-backup-${timestamp}.sql`;
    const backupPath = path.join(BACKUP_DIR, filename);

    // Get database connection info from environment
    const dbHost = process.env.POSTGRES_HOST || 'postgres';
    const dbPort = process.env.POSTGRES_PORT || '5432';
    const dbName = process.env.POSTGRES_DB || 'allerac';
    const dbUser = process.env.POSTGRES_USER || 'allerac';
    const dbPassword = process.env.POSTGRES_PASSWORD || 'allerac';

    // Run pg_dump
    const command = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F p > "${backupPath}"`;

    await execAsync(command);

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
  try {
    // Validate filename to prevent path traversal
    if (!filename.startsWith('allerac-backup-') || !filename.endsWith('.sql')) {
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
  try {
    // Validate filename to prevent path traversal
    if (!filename.startsWith('allerac-backup-') || !filename.endsWith('.sql')) {
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

    // Get database connection info from environment
    const dbHost = process.env.POSTGRES_HOST || 'postgres';
    const dbPort = process.env.POSTGRES_PORT || '5432';
    const dbName = process.env.POSTGRES_DB || 'allerac';
    const dbUser = process.env.POSTGRES_USER || 'allerac';
    const dbPassword = process.env.POSTGRES_PASSWORD || 'allerac';

    // Run psql to restore
    const command = `PGPASSWORD="${dbPassword}" psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${backupPath}"`;

    await execAsync(command);

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
  try {
    // Validate filename to prevent path traversal
    if (!filename.startsWith('allerac-backup-') || !filename.endsWith('.sql')) {
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
  try {
    await ensureBackupDir();

    // Generate a new filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `allerac-backup-${timestamp}-imported.sql`;
    const backupPath = path.join(BACKUP_DIR, filename);

    // Decode base64 and write to file
    const content = Buffer.from(base64Content, 'base64');
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
