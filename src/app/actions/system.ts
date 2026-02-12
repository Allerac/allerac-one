'use server';

import os from 'os';
import pool from '@/app/clients/db';

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

export interface DatabaseInfo {
  connected: boolean;
  version?: string;
  tables: {
    users: number;
    conversations: number;
    messages: number;
    memories: number;
    documents: number;
  };
  error?: string;
}

export interface SystemDashboard {
  system: SystemInfo;
  memory: MemoryInfo;
  cpu: CpuInfo;
  ollama: OllamaInfo;
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
 * Get Ollama status and models
 */
export async function getOllamaInfo(): Promise<OllamaInfo> {
  try {
    // Get Ollama version
    const versionResponse = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      method: 'GET',
    });

    let version: string | undefined;
    if (versionResponse.ok) {
      const versionData = await versionResponse.json();
      version = versionData.version;
    }

    // Get models
    const modelsResponse = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
    });

    if (!modelsResponse.ok) {
      return {
        connected: false,
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
    return {
      connected: false,
      error: error.message || 'Connection failed',
      models: [],
    };
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseInfo(): Promise<DatabaseInfo> {
  try {
    // Test connection and get version
    const versionResult = await pool.query('SELECT version()');
    const version = versionResult.rows[0]?.version?.split(' ').slice(0, 2).join(' ') || 'Unknown';

    // Get table counts
    const [usersResult, conversationsResult, messagesResult, memoriesResult, documentsResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query('SELECT COUNT(*) as count FROM conversations'),
      pool.query('SELECT COUNT(*) as count FROM messages'),
      pool.query('SELECT COUNT(*) as count FROM memories').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) as count FROM documents').catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    return {
      connected: true,
      version,
      tables: {
        users: parseInt(usersResult.rows[0].count, 10),
        conversations: parseInt(conversationsResult.rows[0].count, 10),
        messages: parseInt(messagesResult.rows[0].count, 10),
        memories: parseInt(memoriesResult.rows[0].count, 10),
        documents: parseInt(documentsResult.rows[0].count, 10),
      },
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message || 'Connection failed',
      tables: {
        users: 0,
        conversations: 0,
        messages: 0,
        memories: 0,
        documents: 0,
      },
    };
  }
}

/**
 * Get full system dashboard data
 */
export async function getSystemDashboard(): Promise<SystemDashboard> {
  const [system, memory, cpu, ollama, database] = await Promise.all([
    getSystemInfo(),
    getMemoryInfo(),
    getCpuInfo(),
    getOllamaInfo(),
    getDatabaseInfo(),
  ]);

  return {
    system,
    memory,
    cpu,
    ollama,
    database,
    timestamp: new Date().toISOString(),
  };
}
