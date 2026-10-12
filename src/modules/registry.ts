/**
 * Central registry of optional modules (step 1: thin manifests, no code moved).
 *
 * Server-only: it reads ALLERAC_MODULES / ALLERAC_PROFILE from process.env.
 * Client components must receive already-filtered data (e.g. allowedDomains).
 */
import { resolveModuleSelection, type ModuleSelection } from '@/lib/runtime-config';
import type { ModuleManifest } from './types';
import health from './health/module';
import music from './music/module';
import email from './email/module';
import social from './social/module';
import openworld from './openworld/module';
import sales from './sales/module';

export const MODULES: readonly ModuleManifest[] = [health, music, email, social, openworld, sales];

export const MODULE_IDS: readonly string[] = MODULES.map((m) => m.id);

type Env = Record<string, string | undefined>;

export function getModuleSelection(env: Env = process.env): ModuleSelection {
  return resolveModuleSelection(MODULE_IDS, env);
}

export function getModule(id: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.id === id);
}

export function getEnabledModules(env: Env = process.env): ModuleManifest[] {
  const enabled = new Set(getModuleSelection(env).enabled);
  return MODULES.filter((m) => enabled.has(m.id));
}

export function getDisabledModules(env: Env = process.env): ModuleManifest[] {
  const enabled = new Set(getModuleSelection(env).enabled);
  return MODULES.filter((m) => !enabled.has(m.id));
}

export function isModuleEnabled(id: string, env: Env = process.env): boolean {
  return getModuleSelection(env).enabled.includes(id);
}

/** Domain slugs owned by disabled modules. Empty with the default profile "all". */
export function getDisabledDomainSlugs(env: Env = process.env): string[] {
  return getDisabledModules(env).flatMap((m) => m.domains);
}

/** True unless the slug belongs to a disabled module. Core and unknown slugs are always enabled. */
export function isDomainEnabled(slug: string, env: Env = process.env): boolean {
  return !getDisabledDomainSlugs(env).includes(slug);
}

/** Tool names owned by disabled modules. */
export function getDisabledToolNames(env: Env = process.env): string[] {
  return getDisabledModules(env).flatMap((m) => m.tools);
}

export function isToolEnabled(toolName: string, env: Env = process.env): boolean {
  return !getDisabledToolNames(env).includes(toolName);
}

/** Drops OpenAI-style tool definitions owned by disabled modules. Returns the same array when nothing is disabled. */
export function filterEnabledTools<T extends { function: { name: string } }>(tools: T[], env: Env = process.env): T[] {
  const disabled = getDisabledToolNames(env);
  if (disabled.length === 0) return tools;
  return tools.filter((t) => !disabled.includes(t.function.name));
}

/** Drops domain slugs owned by disabled modules. */
export function filterEnabledDomainSlugs(slugs: string[], env: Env = process.env): string[] {
  const disabled = getDisabledDomainSlugs(env);
  if (disabled.length === 0) return slugs;
  return slugs.filter((s) => !disabled.includes(s));
}
