import { isExecutorEnabled } from './executor-enabled';

const APP_REQUIRED_SECRETS = [
  'ENCRYPTION_KEY',
  'TELEGRAM_TOKEN_ENCRYPTION_KEY',
  'EXECUTOR_SECRET',
] as const;

const WORKER_REQUIRED_SECRETS = [
  'ENCRYPTION_KEY',
  'EXECUTOR_SECRET',
] as const;

/**
 * Module selection for this Unit (docs/operations/modules-and-profiles.md).
 *
 * - ALLERAC_MODULES: explicit comma list of optional modules (e.g. "health,music").
 *   "all" or "*" enables every module; "none" enables none (core only). A blank
 *   value counts as unset (Compose passes ALLERAC_MODULES= when it is not configured).
 * - ALLERAC_PROFILE: preset used when ALLERAC_MODULES is unset.
 * - Neither set: profile "all", which keeps the behavior of a classic install.
 *
 * Core features are always on and are not listed here.
 */
export const ALLERAC_PROFILES = {
  all: '*',
  personal: ['health', 'music', 'email', 'social'],
  openworld: ['openworld'],
  sales: ['sales'],
} as const satisfies Record<string, '*' | readonly string[]>;

export type AlleracProfile = keyof typeof ALLERAC_PROFILES;

export interface ModuleSelection {
  /** Enabled module ids, in knownModuleIds order. */
  enabled: string[];
  source: 'ALLERAC_MODULES' | 'ALLERAC_PROFILE' | 'default';
  profile: AlleracProfile | null;
  /** Names that did not match a known profile or module. */
  unknown: string[];
}

function expand(list: '*' | readonly string[], known: readonly string[]): string[] {
  return list === '*' ? [...known] : known.filter((id) => list.includes(id));
}

export function resolveModuleSelection(
  knownModuleIds: readonly string[],
  env: Record<string, string | undefined> = process.env,
): ModuleSelection {
  const rawModules = env.ALLERAC_MODULES?.trim();
  if (rawModules) {
    const names = rawModules.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
    const wildcard = names.includes('all') || names.includes('*');
    const requested = names.filter((n) => n !== 'all' && n !== '*' && n !== 'none');
    return {
      enabled: wildcard ? [...knownModuleIds] : expand(requested, knownModuleIds),
      source: 'ALLERAC_MODULES',
      profile: null,
      unknown: requested.filter((n) => !knownModuleIds.includes(n)),
    };
  }

  const rawProfile = env.ALLERAC_PROFILE?.trim().toLowerCase();
  if (rawProfile) {
    if (Object.prototype.hasOwnProperty.call(ALLERAC_PROFILES, rawProfile)) {
      const profile = rawProfile as AlleracProfile;
      return {
        enabled: expand(ALLERAC_PROFILES[profile], knownModuleIds),
        source: 'ALLERAC_PROFILE',
        profile,
        unknown: [],
      };
    }
    // Unknown profile: fail open to "all" here; validateRuntimeConfig rejects it at boot.
    return { enabled: [...knownModuleIds], source: 'ALLERAC_PROFILE', profile: null, unknown: [rawProfile] };
  }

  return { enabled: [...knownModuleIds], source: 'default', profile: 'all', unknown: [] };
}

function collectModuleErrors(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  const profile = env.ALLERAC_PROFILE?.trim().toLowerCase();
  if (profile && !Object.prototype.hasOwnProperty.call(ALLERAC_PROFILES, profile)) {
    errors.push(`ALLERAC_PROFILE must be one of: ${Object.keys(ALLERAC_PROFILES).join(', ')}`);
  }
  return errors;
}

function collectConfigErrors(
  env: Record<string, string | undefined>,
  requiredSecrets: readonly string[],
): string[] {
  const errors: string[] = [];

  for (const name of requiredSecrets) {
    const value = env[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    else if (value.length < 32) errors.push(`${name} must contain at least 32 characters`);
  }

  if (!env.DATABASE_URL?.trim()) errors.push('DATABASE_URL is required');
  // Lean Units run without the executor (EXECUTOR_ENABLED=false). EXECUTOR_SECRET
  // is still required: it also authenticates internal calls (jobs, log-submit).
  if (isExecutorEnabled(env) && !env.EXECUTOR_URL?.trim()) errors.push('EXECUTOR_URL is required');

  errors.push(...collectModuleErrors(env));

  return errors;
}

function assertValidConfig(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`);
  }
}

export function validateRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): void {
  assertValidConfig(collectConfigErrors(env, APP_REQUIRED_SECRETS));
}

export function validateWorkerRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): void {
  assertValidConfig(collectConfigErrors(env, WORKER_REQUIRED_SECRETS));
}
