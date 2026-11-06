/** @jest-environment node */

import { buildManifest, isPairingAccepted, isPublicUnit } from '@/federation/manifest';
import { federationManifestSchema } from '@/federation/manifest.schema';

const build = (env: Record<string, string | undefined>, requestUrl = 'https://napols.example/.well-known/allerac') =>
  buildManifest({ env, requestUrl, release: '0.1.0' });

describe('federation manifest', () => {
  it('produces a schema-valid manifest with safe defaults', () => {
    const manifest = build({});
    expect(federationManifestSchema.parse(manifest)).toEqual(manifest);
    expect(manifest).toMatchObject({
      allerac: 'federation',
      protocolVersion: '1',
      unit: { name: 'allerac', displayName: 'allerac', url: 'https://napols.example' },
      software: { name: 'allerac-one', release: '0.1.0' },
      pairing: { accepting: false },
      publicKey: null,
      endpoints: { api: '/api/v1' },
    });
    expect(manifest.capabilities.length).toBeGreaterThan(0);
  });

  it('uses unit name, display name and public URL from env', () => {
    const manifest = build({
      ALLERAC_UNIT: 'website',
      ALLERAC_UNIT_NAME: 'Napols',
      ALLERAC_UNIT_DISPLAY_NAME: 'Napols Home',
      ALLERAC_PUBLIC_URL: 'https://unit1.allerac.ai/some/path',
    });
    expect(manifest.unit).toEqual({ name: 'napols', displayName: 'Napols Home', url: 'https://unit1.allerac.ai' });
  });

  it('falls back to ALLERAC_UNIT and ignores invalid names', () => {
    expect(build({ ALLERAC_UNIT: 'openworld' }).unit.name).toBe('openworld');
    expect(build({ ALLERAC_UNIT_NAME: 'bad name!' }).unit.name).toBe('allerac');
  });

  it('only accepts pairing on explicit opt-in', () => {
    expect(isPairingAccepted({ ALLERAC_PROFILE: 'personal' })).toBe(false);
    expect(isPairingAccepted({ ALLERAC_PROFILE: 'personal', ALLERAC_PAIRING_ACCEPT: 'true' })).toBe(true);
  });

  it('keeps pairing closed on public Units unless the public override is set', () => {
    expect(isPublicUnit({ ALLERAC_PROFILE: 'openworld' })).toBe(true);
    expect(isPublicUnit({ ALLERAC_PROFILE: 'personal' })).toBe(false);
    expect(isPairingAccepted({ ALLERAC_PROFILE: 'openworld', ALLERAC_PAIRING_ACCEPT: 'true' })).toBe(false);
    expect(isPairingAccepted({ ALLERAC_PROFILE: 'all', ALLERAC_PAIRING_ACCEPT: 'true' })).toBe(false);
    expect(isPairingAccepted({
      ALLERAC_PROFILE: 'openworld', ALLERAC_PAIRING_ACCEPT: 'true', ALLERAC_PAIRING_ACCEPT_PUBLIC: 'true',
    })).toBe(true);
  });

  it('never exposes internal details', () => {
    const text = JSON.stringify(build({ ALLERAC_PROFILE: 'all', DATABASE_URL: 'postgres://secret' }));
    for (const forbidden of ['commit', 'domains', 'modules', 'tools', 'email', 'model', 'postgres', 'health', 'openworld']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });
});
