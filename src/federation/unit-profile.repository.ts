/** DB access for the singleton `unit_profile` row, with a short cache. */
import pool from '@/app/clients/db';
import type { SoulIdentity } from '@/app/config/allerac-soul';
import { resolveUnitProfile, soulIdentityFor, type UnitProfile, type UnitProfileInput, type UnitProfileRow } from './unit-profile';

const CACHE_MS = 30_000;
let cache: { at: number; row: UnitProfileRow | null } | null = null;

function fromDb(row: Record<string, unknown>): UnitProfileRow {
  return {
    displayName: (row.display_name as string | null) ?? null,
    emoji: (row.emoji as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    tags: (row.tags as string[] | null) ?? [],
    agentDescriptions: (row.agent_descriptions as Record<string, string> | null) ?? {},
    identityInPublicDomains: (row.identity_in_public_domains as boolean | null) ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}

export async function loadUnitProfileRow(): Promise<UnitProfileRow | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.row;
  try {
    const result = await pool.query('SELECT * FROM unit_profile WHERE id = 1');
    const row = result.rows[0] ? fromDb(result.rows[0]) : null;
    cache = { at: Date.now(), row };
    return row;
  } catch (error) {
    // Table missing (migration not applied yet) must never break chat.
    console.error('[UnitProfile] load failed:', error);
    return null;
  }
}

/** Effective profile (row + env fallbacks). Never throws. */
export async function loadUnitProfile(): Promise<UnitProfile> {
  return resolveUnitProfile(await loadUnitProfileRow());
}

export async function saveUnitProfile(input: UnitProfileInput, userId: string): Promise<UnitProfileRow> {
  const current = await loadUnitProfileRow();
  const merged = {
    displayName: input.displayName !== undefined ? input.displayName || null : current?.displayName ?? null,
    emoji: input.emoji !== undefined ? input.emoji || null : current?.emoji ?? null,
    role: input.role !== undefined ? input.role || null : current?.role ?? null,
    description: input.description !== undefined ? input.description || null : current?.description ?? null,
    tags: input.tags ?? current?.tags ?? [],
    agentDescriptions: input.agentDescriptions
      ? Object.fromEntries(Object.entries(input.agentDescriptions).filter(([, text]) => text.trim()))
      : current?.agentDescriptions ?? {},
    identityInPublicDomains: input.identityInPublicDomains !== undefined
      ? input.identityInPublicDomains
      : current?.identityInPublicDomains ?? null,
  };
  const result = await pool.query(
    `INSERT INTO unit_profile (id, display_name, emoji, role, description, tags, agent_descriptions,
       identity_in_public_domains, updated_at, updated_by)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, NOW(), $8)
     ON CONFLICT (id) DO UPDATE SET
       display_name = EXCLUDED.display_name, emoji = EXCLUDED.emoji, role = EXCLUDED.role,
       description = EXCLUDED.description, tags = EXCLUDED.tags,
       agent_descriptions = EXCLUDED.agent_descriptions,
       identity_in_public_domains = EXCLUDED.identity_in_public_domains,
       updated_at = NOW(), updated_by = EXCLUDED.updated_by
     RETURNING *`,
    [merged.displayName, merged.emoji, merged.role, merged.description, merged.tags,
      JSON.stringify(merged.agentDescriptions), merged.identityInPublicDomains, userId],
  );
  const row = fromDb(result.rows[0]);
  cache = { at: Date.now(), row };
  return row;
}

/** Soul identity for a domain (undefined for public domains unless opted in). Never throws. */
export async function loadSoulIdentity(domain?: string | null): Promise<SoulIdentity | undefined> {
  try {
    return soulIdentityFor(await loadUnitProfile(), domain);
  } catch {
    return undefined;
  }
}
