/**
 * Federation capability registry (roadmap P1).
 *
 * Typed list of what a Unit may advertise to other Units. Each capability maps
 * 1:1 to a P0 service scope so pairing (P2) can turn advertised capabilities
 * into key scopes directly. Server-only: reads module selection from env.
 */
import type { ControlApiScope } from '@/app/services/api-keys/api-key-scopes';
import { isModuleEnabled } from '@/modules/registry';
import { envList, type Env } from './env';

export interface FederationCapability {
  /** Public id, e.g. `federation.agents.ask`. */
  id: `federation.${string}`;
  /** Contract version of this capability. */
  version: string;
  /** Service scope that grants this capability to a peer. */
  scope: ControlApiScope;
  /** Only advertised when this optional module is enabled. */
  requiresModule?: string;
  /** May appear in the public manifest. */
  publicSafe: boolean;
  description: string;
}

export const FEDERATION_CAPABILITIES: readonly FederationCapability[] = [
  {
    id: 'federation.manifest.read',
    version: '1',
    scope: 'federation:manifest:read',
    publicSafe: true,
    description: 'Read authenticated manifest details.',
  },
  {
    id: 'federation.agents.list',
    version: '1',
    scope: 'federation:agents:list',
    publicSafe: true,
    description: 'List agents this Unit exposes to paired peers.',
  },
  {
    id: 'federation.agents.ask',
    version: '1',
    scope: 'federation:agents:ask',
    publicSafe: true,
    description: 'Ask an exposed agent a quick synchronous question.',
  },
  {
    id: 'federation.runs.create',
    version: '1',
    scope: 'federation:runs:create',
    publicSafe: true,
    description: 'Create a cross-unit agent run.',
  },
  {
    id: 'federation.runs.read',
    version: '1',
    scope: 'federation:runs:read',
    publicSafe: true,
    description: 'Read the status and result of a cross-unit agent run.',
  },
];

/**
 * Capabilities this Unit advertises publicly: public-safe, module enabled, and
 * (when ALLERAC_FEDERATION_CAPABILITIES is set) in that allow-list.
 */
export function getAdvertisedCapabilities(
  env: Env = process.env,
  registry: readonly FederationCapability[] = FEDERATION_CAPABILITIES,
): FederationCapability[] {
  const allowList = envList(env, 'ALLERAC_FEDERATION_CAPABILITIES');
  return registry.filter(capability => (
    capability.publicSafe
    && (!capability.requiresModule || isModuleEnabled(capability.requiresModule, env))
    && (!allowList || allowList.includes(capability.id))
  ));
}
