'use server';

import pool from '@/app/clients/db';
import { getCurrentUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';

async function assertUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function getWatchlist(): Promise<string[]> {
  const user = await assertUser();
  const result = await pool.query(
    `SELECT symbol FROM user_watchlist WHERE user_id = $1 ORDER BY added_at ASC`,
    [user.id]
  );
  return result.rows.map((r: { symbol: string }) => r.symbol);
}

export async function addToWatchlist(symbol: string): Promise<void> {
  const user = await assertUser();
  await pool.query(
    `INSERT INTO user_watchlist (user_id, symbol) VALUES ($1, $2) ON CONFLICT (user_id, symbol) DO NOTHING`,
    [user.id, symbol.toUpperCase().trim()]
  );
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const user = await assertUser();
  await pool.query(
    `DELETE FROM user_watchlist WHERE user_id = $1 AND symbol = $2`,
    [user.id, symbol]
  );
}
