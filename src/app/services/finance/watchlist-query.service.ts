// Watchlist reads/writes against Postgres. Shared by the finance Server
// Actions (src/app/actions/finance.ts, used by the web UI) and the Control
// API v1 routes (src/app/api/v1/finance/watchlist*, used by external
// API-key clients) so the SQL isn't duplicated between the two call paths —
// Server Actions can't be invoked with a Bearer token, so the API routes
// can't call them directly.

import pool from '@/app/clients/db';

export async function queryWatchlist(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT symbol FROM user_watchlist WHERE user_id = $1 ORDER BY added_at ASC`,
    [userId],
  );
  return result.rows.map((r: { symbol: string }) => r.symbol);
}

export async function addWatchlistSymbol(userId: string, symbol: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_watchlist (user_id, symbol) VALUES ($1, $2) ON CONFLICT (user_id, symbol) DO NOTHING`,
    [userId, symbol.toUpperCase().trim()],
  );
}

export async function removeWatchlistSymbol(userId: string, symbol: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM user_watchlist WHERE user_id = $1 AND symbol = $2`,
    [userId, symbol],
  );
  return (result.rowCount ?? 0) > 0;
}
