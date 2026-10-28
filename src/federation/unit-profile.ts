/**
 * Unit identity & role (roadmap P3.5).
 *
 * The Unit *name* (santos, barcelona, ...) is its stable identity and comes
 * from env. The *role* (what this Unit takes care of) is an admin-editable
 * property stored in `unit_profile`, with env fallbacks. Pure and DB-free.
 */
import { z } from 'zod';
import type { SoulIdentity } from '@/app/config/allerac-soul';
import { PUBLIC_DOMAINS } from '@/app/services/chat/public-domains';
import { envFlag, type Env } from './env';
import { unitName } from './manifest';

export const unitProfileInputSchema = z.object({
  displayName: z.string().trim().max(100).nullable().optional(),
  emoji: z.string().trim().max(16).nullable().optional(),
  role: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  agentDescriptions: z.record(
    z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
    z.string().trim().max(300),
  ).optional(),
  identityInPublicDomains: z.boolean().nullable().optional(),
}).strict();
export type UnitProfileInput = z.infer<typeof unitProfileInputSchema>;

/** Stored row (all optional: empty fields fall back to env). */
export interface UnitProfileRow {
  displayName: string | null;
  emoji: string | null;
  role: string | null;
  description: string | null;
  tags: string[];
  agentDescriptions: Record<string, string>;
  identityInPublicDomains: boolean | null;
  updatedAt: string | null;
}

/** Effective profile after env fallbacks. */
export interface UnitProfile {
  name: string;
  displayName: string;
  emoji: string | null;
  role: string | null;
  description: string | null;
  tags: string[];
  agentDescriptions: Record<string, string>;
  identityInPublicDomains: boolean;
}

/** What paired peers receive (everything except local-only switches). */
export const peerUnitProfileSchema = z.object({
  name: z.string().min(1).max(63),
  displayName: z.string().min(1).max(100),
  emoji: z.string().max(16).nullable(),
  role: z.string().max(200).nullable(),
  description: z.string().max(1000).nullable(),
  tags: z.array(z.string().max(32)).max(10),
});
export type PeerUnitProfile = z.infer<typeof peerUnitProfileSchema>;

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function resolveUnitProfile(row: UnitProfileRow | null, env: Env = process.env): UnitProfile {
  const name = unitName(env);
  return {
    name,
    displayName: (clean(row?.displayName) ?? clean(env.ALLERAC_UNIT_DISPLAY_NAME)?.slice(0, 100) ?? capitalize(name)),
    emoji: clean(row?.emoji),
    role: clean(row?.role) ?? clean(env.ALLERAC_UNIT_ROLE)?.slice(0, 200) ?? null,
    description: clean(row?.description) ?? clean(env.ALLERAC_UNIT_DESCRIPTION)?.slice(0, 1000) ?? null,
    tags: row?.tags ?? [],
    agentDescriptions: row?.agentDescriptions ?? {},
    identityInPublicDomains: row?.identityInPublicDomains ?? envFlag(env, 'ALLERAC_UNIT_IDENTITY_PUBLIC', false),
  };
}

export function toPeerProfile(profile: UnitProfile): PeerUnitProfile {
  return {
    name: profile.name,
    displayName: profile.displayName,
    emoji: profile.emoji,
    role: profile.role,
    description: profile.description,
    tags: profile.tags,
  };
}

/** Public domains only get the identity when the admin opted in. */
export function shouldInjectIdentity(domain: string, profile: UnitProfile): boolean {
  return !PUBLIC_DOMAINS.includes(domain) || profile.identityInPublicDomains;
}

/**
 * Soul identity for a domain, or undefined when it must not apply (public
 * domains without the admin opt-in).
 */
export function soulIdentityFor(profile: UnitProfile, domain?: string | null): SoulIdentity | undefined {
  if (domain && !shouldInjectIdentity(domain, profile)) return undefined;
  return {
    displayName: profile.displayName,
    role: profile.role,
    description: profile.description,
    agentDescription: domain ? profile.agentDescriptions[domain] ?? null : null,
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
