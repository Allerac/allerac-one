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

let namesCache: { value: string[]; at: number } | null = null;

/** Labels of active paired Units for the soul identity, e.g. "Santos (santos)". Cached, never throws. */
export async function listActivePeerLabels(now = Date.now()): Promise<string[]> {
  if (namesCache && now - namesCache.at < CACHE_MS) return namesCache.value;
  try {
    const result = await pool.query(
      `SELECT unit_name, display_name FROM federation_peers WHERE status = 'active' ORDER BY unit_name LIMIT 10`,
    );
    namesCache = {
      value: result.rows.map((row: { unit_name: string; display_name: string | null }) => {
        const display = row.display_name?.trim();
        return display && display.toLowerCase() !== row.unit_name ? `${display} (${row.unit_name})` : row.unit_name;
      }),
      at: now,
    };
  } catch {
    namesCache = { value: [], at: now };
  }
  return namesCache.value;
}

export function resetPeerPresenceCacheForTests(): void {
  cache = null;
  namesCache = null;
}
