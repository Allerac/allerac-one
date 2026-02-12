'use server';

import { cookies } from 'next/headers';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface SystemStatus {
  ollama: {
    connected: boolean;
    models: OllamaModel[];
    error?: string;
  };
  database: {
    connected: boolean;
    error?: string;
  };
}

/**
 * Get available Ollama models
 */
export async function getOllamaModels(): Promise<{ success: true; models: OllamaModel[] } | { success: false; error: string }> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText || 'Failed to get models' };
    }

    const data = await response.json();
    return { success: true, models: data.models || [] };
  } catch (error: any) {
    console.error('Error getting Ollama models:', error);
    return { success: false, error: error.message || 'Failed to connect to Ollama' };
  }
}

/**
 * Test Ollama connection with a simple chat
 */
export async function testOllamaConnection(model: string): Promise<{ success: true; response: string; responseTime: number } | { success: false; error: string }> {
  const startTime = Date.now();

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "Hello! I am ready." in exactly those words.' }],
        stream: false,
      }),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: errorData.error || 'Failed to get response' };
    }

    const data = await response.json();
    const content = data.message?.content || '';

    return { success: true, response: content, responseTime };
  } catch (error: any) {
    console.error('Error testing Ollama:', error);
    return { success: false, error: error.message || 'Failed to connect to Ollama' };
  }
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const pool = (await import('@/app/clients/db')).default;
    await pool.query('SELECT 1');
    return { success: true };
  } catch (error: any) {
    console.error('Error testing database:', error);
    return { success: false, error: error.message || 'Failed to connect to database' };
  }
}

/**
 * Get full system status
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const [ollamaResult, dbResult] = await Promise.all([
    getOllamaModels(),
    testDatabaseConnection(),
  ]);

  return {
    ollama: {
      connected: ollamaResult.success,
      models: ollamaResult.success ? ollamaResult.models : [],
      error: !ollamaResult.success ? ollamaResult.error : undefined,
    },
    database: {
      connected: dbResult.success,
      error: !dbResult.success ? dbResult.error : undefined,
    },
  };
}

/**
 * Save user's preferred locale
 */
export async function saveLocale(locale: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('locale', locale, {
    httpOnly: false, // Accessible by client for i18n
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
  });
}

/**
 * Save default model preference
 */
export async function saveDefaultModel(userId: string, model: string): Promise<{ success: boolean }> {
  try {
    const pool = (await import('@/app/clients/db')).default;

    // Check if user_settings table exists and has default_model column
    await pool.query(
      `INSERT INTO user_settings (user_id, default_model)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET default_model = $2`,
      [userId, model]
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error saving default model:', error);
    return { success: false };
  }
}

/**
 * Mark setup as complete
 */
export async function markSetupComplete(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('setup_complete', 'true', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365 * 10, // 10 years
    path: '/',
  });
}

/**
 * Check if setup is complete
 */
export async function isSetupComplete(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get('setup_complete')?.value === 'true';
}
