'use server';

import { getCurrentUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import { addWatchlistSymbol, queryWatchlist, removeWatchlistSymbol } from '@/app/services/finance/watchlist-query.service';

async function assertUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function getWatchlist(): Promise<string[]> {
  const user = await assertUser();
  return queryWatchlist(user.id);
}

export async function addToWatchlist(symbol: string): Promise<void> {
  const user = await assertUser();
  await addWatchlistSymbol(user.id, symbol);
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const user = await assertUser();
  await removeWatchlistSymbol(user.id, symbol);
}
