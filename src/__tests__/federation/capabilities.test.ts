/** @jest-environment node */

import { FEDERATION_CAPABILITIES, getAdvertisedCapabilities } from '@/federation/capabilities';
import { SERVICE_ALLOWED_SCOPES, isKnownScope } from '@/app/services/api-keys/api-key-scopes';

describe('federation capability registry', () => {
  it('has unique ids', () => {
    const ids = FEDERATION_CAPABILITIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps every capability to a known, service-allowed scope', () => {
    for (const capability of FEDERATION_CAPABILITIES) {
      expect(isKnownScope(capability.scope)).toBe(true);
      expect(SERVICE_ALLOWED_SCOPES).toContain(capability.scope);
    }
  });

  it('advertises all public-safe capabilities by default', () => {
    expect(getAdvertisedCapabilities({}).map(c => c.id)).toEqual(
      FEDERATION_CAPABILITIES.filter(c => c.publicSafe).map(c => c.id),
    );
  });

  it('narrows to ALLERAC_FEDERATION_CAPABILITIES', () => {
    const ids = getAdvertisedCapabilities({ ALLERAC_FEDERATION_CAPABILITIES: 'federation.agents.list, made.up' }).map(c => c.id);
    expect(ids).toEqual(['federation.agents.list']);
  });

  it('hides module-gated capabilities when the module is disabled', () => {
    const gated = { ...FEDERATION_CAPABILITIES[0], requiresModule: 'health' };
    expect(getAdvertisedCapabilities({ ALLERAC_PROFILE: 'openworld' }, [gated])).toEqual([]);
    expect(getAdvertisedCapabilities({ ALLERAC_PROFILE: 'personal' }, [gated])).toEqual([gated]);
  });

  it('never advertises capabilities that are not public-safe', () => {
    const internal = { ...FEDERATION_CAPABILITIES[0], publicSafe: false };
    expect(getAdvertisedCapabilities({}, [internal])).toEqual([]);
  });
});
