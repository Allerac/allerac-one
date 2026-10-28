import pool from '@/app/clients/db';

const CACHE_MS = 30_000;
let cache: { value: boolean; at: number } | null = null;

/** Cheap, cached check used to decide whether federation tools are offered at all. */
export async function hasActivePeers(now = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  try {
    const result = await pool.query(`SELECT 1 FROM federation_peers WHERE status = 'active' LIMIT 1`);
    cache = { value: result.rows.length > 0, at: now };
  } catch {
    cache = { value: false, at: now };
  }
  return cache.value;
}

export function resetPeerPresenceCacheForTests(): void {
  cache = null;
}
