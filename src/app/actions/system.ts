'use server';

import os from 'os';
import fs from 'fs/promises';
import pool from '@/app/clients/db';
import { safeDecrypt } from '@/app/services/crypto/encryption.service';
import { GITHUB_MODELS } from '@/app/constants/models';

const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  uptime: number;
  nodeVersion: string;
}

export interface MemoryInfo {
  total: number;
  free: number;
  used: number;
  usedPercent: number;
}

export interface CpuInfo {
  cores: number;
  model: string;
  loadAvg: number[];
}

export interface DiskInfo {
  // Note: Getting disk info requires spawning a process, simplified for now
  available: boolean;
}

export interface OllamaInfo {
  connected: boolean;
  version?: string;
  models: Array<{
    name: string;
    size: number;
    modified_at: string;
  }>;
  error?: string;
}

export interface GithubModelsInfo {
  configured: boolean;
  connected: boolean;
  models: Array<{
    id: string;
    name: string;
    icon: string;
    description: string;
  }>;
  error?: string;
}

export interface AIModelsInfo {
  github: GithubModelsInfo;
  ollama: OllamaInfo;
}

export interface DatabaseInfo {
  connected: boolean;
  version?: string;
  tables: {
    conversations: number;
    messages: number;
    memories: number;
    documents: number;
    backups: number;
  };
  error?: string;
}

export interface SystemDashboard {
  system: SystemInfo;
  memory: MemoryInfo;
  cpu: CpuInfo;
  aiModels: AIModelsInfo;
  database: DatabaseInfo;
  timestamp: string;
}

/**
 * Get system information
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    nodeVersion: process.version,
  };
}

/**
 * Get memory information
 */
export async function getMemoryInfo(): Promise<MemoryInfo> {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  return {
    total,
    free,
    used,
    usedPercent: Math.round((used / total) * 100),
  };
}

/**
 * Get CPU information
 */
export async function getCpuInfo(): Promise<CpuInfo> {
  const cpus = os.cpus();

  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    loadAvg: os.loadavg(),
  };
}

/**
 * Get Ollama status and models (with short timeout)
 */
export async function getOllamaInfo(): Promise<OllamaInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000); // 2 second timeout

  try {
    // Get Ollama version with timeout
    const versionResponse = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    let version: string | undefined;
    if (versionResponse.ok) {
      const versionData = await versionResponse.json();
      version = versionData.version;
    }

    // Get models (reuse timeout approach)
    const modelsController = new AbortController();
    const modelsTimeout = setTimeout(() => modelsController.abort(), 2000);

    const modelsResponse = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: modelsController.signal,
    });

    clearTimeout(modelsTimeout);

    if (!modelsResponse.ok) {
      return {
        connected: true, // Connected but failed to get models
        version,
        error: 'Failed to fetch models',
        models: [],
      };
    }

    const modelsData = await modelsResponse.json();

    return {
      connected: true,
      version,
      models: modelsData.models || [],
    };
  } catch (error: any) {
    clearTimeout(timeout);
    return {
      connected: false,
      error: error.name === 'AbortError' ? 'Timeout' : (error.message || 'Connection failed'),
      models: [],
    };
  }
}

/**
 * Get GitHub Models status (fast check - just verifies if token is configured)
 */
export async function getGithubModelsInfo(userId?: string): Promise<GithubModelsInfo> {
  try {
    // Just check if user has configured a GitHub token (don't test connection - that's slow)
    if (userId) {
      const result = await pool.query(
        'SELECT github_token FROM user_settings WHERE user_id = $1',
        [userId]
      );
      if (result.rows.length > 0 && result.rows[0].github_token) {
        const token = safeDecrypt(result.rows[0].github_token);
        if (token && token.length > 0) {
          return {
            configured: true,
            connected: true, // Assume connected if configured (actual test happens on chat)
            models: GITHUB_MODELS,
          };
        }
      }
    }

    return {
      configured: false,
      connected: false,
      models: GITHUB_MODELS,
    };
  } catch (error: any) {
    return {
      configured: false,
      connected: false,
      models: GITHUB_MODELS,
      error: error.message || 'Check failed',
    };
  }
}

/**
 * Get AI Models info (both providers)
 */
export async function getAIModelsInfo(userId?: string): Promise<AIModelsInfo> {
  const [github, ollama] = await Promise.all([
    getGithubModelsInfo(userId),
    getOllamaInfo(),
  ]);

  return { github, ollama };
}

/**
 * Count backup files
 */
async function countBackups(): Promise<number> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    return files.filter(f => f.startsWith('allerac-backup-') && f.endsWith('.sql')).length;
  } catch {
    return 0;
  }
}

/**
 * Get database statistics for a specific user
 */
export async function getDatabaseInfo(userId?: string): Promise<DatabaseInfo> {
  try {
    // Test connection and get version
    const versionResult = await pool.query('SELECT version()');
    const version = versionResult.rows[0]?.version?.split(' ').slice(0, 2).join(' ') || 'Unknown';

    // Get table counts filtered by user (if userId provided)
    const [conversationsResult, messagesResult, memoriesResult, documentsResult, backupsCount] = await Promise.all([
      userId
        ? pool.query('SELECT COUNT(*) as count FROM chat_conversations WHERE user_id = $1', [userId])
        : pool.query('SELECT COUNT(*) as count FROM chat_conversations'),
      userId
        ? pool.query('SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = $1)', [userId])
        : pool.query('SELECT COUNT(*) as count FROM chat_messages'),
      userId
        ? pool.query('SELECT COUNT(*) as count FROM conversation_summaries WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = $1)', [userId]).catch(() => ({ rows: [{ count: 0 }] }))
        : pool.query('SELECT COUNT(*) as count FROM conversation_summaries').catch(() => ({ rows: [{ count: 0 }] })),
      userId
        ? pool.query('SELECT COUNT(*) as count FROM documents WHERE uploaded_by = $1', [userId]).catch(() => ({ rows: [{ count: 0 }] }))
        : pool.query('SELECT COUNT(*) as count FROM documents').catch(() => ({ rows: [{ count: 0 }] })),
      countBackups(),
    ]);

    return {
      connected: true,
      version,
      tables: {
        conversations: parseInt(conversationsResult.rows[0].count, 10),
        messages: parseInt(messagesResult.rows[0].count, 10),
        memories: parseInt(memoriesResult.rows[0].count, 10),
        documents: parseInt(documentsResult.rows[0].count, 10),
        backups: backupsCount,
      },
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message || 'Connection failed',
      tables: {
        conversations: 0,
        messages: 0,
        memories: 0,
        documents: 0,
        backups: 0,
      },
    };
  }
}

/**
 * Pull/download an Ollama model
 * Note: This initiates the download but doesn't wait for completion (can take several minutes)
 */
export async function pullOllamaModel(modelId: string): Promise<{ success: boolean; message: string }> {
  try {
    // First check if Ollama is connected
    const ollamaInfo = await getOllamaInfo();
    if (!ollamaInfo.connected) {
      return {
        success: false,
        message: 'Ollama is not connected. Please install and start Ollama first.',
      };
    }

    // Check if model is already installed
    const existingModel = ollamaInfo.models.find(m => m.name === modelId || m.name.startsWith(modelId.split(':')[0]));
    if (existingModel) {
      return {
        success: true,
        message: `Model ${modelId} is already installed.`,
      };
    }

    // Start the pull (this will stream, but we just initiate it)
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelId, stream: false }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `Failed to start download: ${error}`,
      };
    }

    return {
      success: true,
      message: `Model ${modelId} download started. This may take several minutes.`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to pull model',
    };
  }
}

/**
 * Get full system dashboard data for a specific user
 */
export async function getSystemDashboard(userId?: string): Promise<SystemDashboard> {
  const [system, memory, cpu, aiModels, database] = await Promise.all([
    getSystemInfo(),
    getMemoryInfo(),
    getCpuInfo(),
    getAIModelsInfo(userId),
    getDatabaseInfo(userId),
  ]);

  return {
    system,
    memory,
    cpu,
    aiModels,
    database,
    timestamp: new Date().toISOString(),
  };
}
