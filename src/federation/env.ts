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

/** One Unit = one agent: expose only the `chat` agent under the Unit's name and role. */
export function singleAgent(env: Env = process.env): boolean {
  return envFlag(env, 'ALLERAC_SINGLE_AGENT', false);
}

/**
 * Domain slugs this Unit exposes as agents to paired peers: `chat` alone with
 * ALLERAC_SINGLE_AGENT, otherwise ALLERAC_FEDERATION_AGENTS.
 */
export function exposedAgentSlugs(env: Env = process.env): string[] {
  if (singleAgent(env)) return ['chat'];
  return (envList(env, 'ALLERAC_FEDERATION_AGENTS') ?? []).map(slug => slug.toLowerCase());
}
