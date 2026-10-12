/**
 * Module manifest contract.
 *
 * A module is an optional group of domains (pages, API routes, tools, skills
 * and Docker services) that a Unit can turn off with ALLERAC_MODULES or
 * ALLERAC_PROFILE. Core features (chat, memory, notes, tickets, jobs, auth,
 * admin, ...) are not modules: they are always on.
 *
 * Step 1 of the modularization plan: manifests are thin and only point at
 * code that still lives in its current location under src/app.
 */
export type ModuleGroup = 'core' | 'external' | 'personal';

export interface ModuleNavEntry {
  key: string;
  name: string;
  icon: string;
  path: string;
}

export interface ModuleManifest {
  /** Stable module id used in ALLERAC_MODULES. */
  id: string;
  group: ModuleGroup;
  description: string;
  /** Domain slugs (domains.slug) owned by this module. */
  domains: string[];
  nav: ModuleNavEntry[];
  /** Tool names (function names offered to the LLM) owned by this module. */
  tools: string[];
  /** Skill files under skills/ owned by this module. */
  skills: string[];
  /** Docker Compose profile that starts this module's services, if any. */
  dockerProfile?: string;
  /** Env vars the module needs to be fully functional (informational). */
  requiredEnv: string[];
}

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest;
}
