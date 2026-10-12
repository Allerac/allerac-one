// Generic, provider-agnostic connection status/config. Credential tables
// (garmin_credentials, spotify_credentials, ...) hold only secrets — everything
// about whether a connection exists, its data mode, and its sync state lives
// here instead. See docs/architecture/allerac-bridge.md.

import pool from '@/app/clients/db';

export type DataMode = 'cached' | 'proxy';

export interface IntegrationConnection {
  isConnected: boolean;
  dataMode: DataMode;
  syncEnabled: boolean;
  lastSyncAt: string | Date | null;
  lastError: string | null;
}

export interface IntegrationConnectionPatch {
  isConnected?: boolean;
  dataMode?: DataMode;
  syncEnabled?: boolean;
  lastSyncAt?: Date | null;
  lastError?: string | null;
}

export async function getConnection(userId: string, provider: string): Promise<IntegrationConnection | null> {
  const res = await pool.query(
    `SELECT is_connected, data_mode, sync_enabled, last_sync_at, last_error
     FROM integration_connections WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    isConnected: row.is_connected,
    dataMode: row.data_mode,
    syncEnabled: row.sync_enabled,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
  };
}

// isConnected/dataMode/syncEnabled/lastSyncAt: omit (undefined) to leave
// unchanged. lastError is always applied as given (including null) — every
// caller in practice has a deliberate opinion on it (clear on success, set a
// message on failure), so pass null explicitly rather than omitting it.
export async function upsertConnection(
  userId: string,
  provider: string,
  patch: IntegrationConnectionPatch,
): Promise<void> {
  await pool.query(
    `INSERT INTO integration_connections (user_id, provider, is_connected, data_mode, sync_enabled, last_sync_at, last_error)
     VALUES ($1, $2, COALESCE($3, false), COALESCE($4, 'cached'), COALESCE($5, true), $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       is_connected = COALESCE($3, integration_connections.is_connected),
       data_mode    = COALESCE($4, integration_connections.data_mode),
       sync_enabled = COALESCE($5, integration_connections.sync_enabled),
       last_sync_at = COALESCE($6, integration_connections.last_sync_at),
       last_error   = $7,
       updated_at   = NOW()`,
    [
      userId,
      provider,
      patch.isConnected ?? null,
      patch.dataMode ?? null,
      patch.syncEnabled ?? null,
      patch.lastSyncAt ?? null,
      patch.lastError ?? null,
    ],
  );
}

export async function clearConnection(userId: string, provider: string): Promise<void> {
  await pool.query(
    'DELETE FROM integration_connections WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  );
}
