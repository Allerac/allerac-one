export type Env = Record<string, string | undefined>;

/** Parses a boolean env flag; unset or blank returns the fallback. */
export function envFlag(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/** Parses a comma-separated env list; unset or blank returns null. */
export function envList(env: Env, name: string): string[] | null {
  const raw = env[name]?.trim();
  if (!raw) return null;
  return raw.split(',').map(item => item.trim()).filter(Boolean);
}
