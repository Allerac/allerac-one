/**
 * Builds the public `/.well-known/allerac` manifest (roadmap P1).
 *
 * Pure and DB-free. Only Unit-level, non-sensitive facts are included: no
 * users, domains, modules, tools, providers, models, hosts, or commit info.
 */
import { PUBLIC_DOMAINS } from '@/app/services/chat/public-domains';
import { getModuleSelection, getModule } from '@/modules/registry';
import { getAdvertisedCapabilities } from './capabilities';
import { envFlag, type Env } from './env';
import { FEDERATION_PROTOCOL_VERSION, type FederationManifest } from './manifest.schema';

const DEFAULT_UNIT_NAME = 'allerac';

export function isManifestEnabled(env: Env = process.env): boolean {
  return envFlag(env, 'ALLERAC_FEDERATION_MANIFEST', true);
}

/** True when the Unit serves any public-facing domain (e.g. openworld, sales). */
export function isPublicUnit(env: Env = process.env): boolean {
  return getModuleSelection(env).enabled.some(id => (
    getModule(id)?.domains.some(domain => PUBLIC_DOMAINS.includes(domain)) ?? false
  ));
}

/**
 * Pairing is opt-in. Public Units never advertise it unless explicitly allowed
 * with ALLERAC_PAIRING_ACCEPT_PUBLIC.
 */
export function isPairingAccepted(env: Env = process.env): boolean {
  if (!envFlag(env, 'ALLERAC_PAIRING_ACCEPT', false)) return false;
  if (isPublicUnit(env)) return envFlag(env, 'ALLERAC_PAIRING_ACCEPT_PUBLIC', false);
  return true;
}

function unitName(env: Env): string {
  const raw = (env.ALLERAC_UNIT_NAME || env.ALLERAC_UNIT || DEFAULT_UNIT_NAME).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(raw) ? raw : DEFAULT_UNIT_NAME;
}

function unitUrl(env: Env, requestUrl?: string): string | null {
  const configured = env.ALLERAC_PUBLIC_URL?.trim();
  const candidate = configured || (requestUrl ? new URL(requestUrl).origin : '');
  if (!candidate) return null;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export function buildManifest(params: {
  env?: Env;
  requestUrl?: string;
  release: string;
}): FederationManifest {
  const env = params.env ?? process.env;
  const name = unitName(env);
  return {
    allerac: 'federation',
    protocolVersion: FEDERATION_PROTOCOL_VERSION,
    unit: {
      name,
      displayName: env.ALLERAC_UNIT_DISPLAY_NAME?.trim().slice(0, 100) || name,
      url: unitUrl(env, params.requestUrl),
    },
    software: { name: 'allerac-one', release: params.release || 'unreleased' },
    pairing: { accepting: isPairingAccepted(env) },
    capabilities: getAdvertisedCapabilities(env).map(({ id, version }) => ({ id, version })),
    publicKey: null,
    endpoints: { api: '/api/v1' },
  };
}
