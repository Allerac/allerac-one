/** Default, DB-backed InboxService (federation P4a). */
import pool from '@/app/clients/db';
import { federationClient } from './federation-client.instance';
import { inboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { loadUserTimeZone } from '@/app/lib/user-timezone';
import { peerRepository } from './peer.repository';
import { toPeerProfile } from './unit-profile';
import { loadUnitProfile } from './unit-profile.repository';

export const inboxService = new InboxService({
  store: inboxRepository,
  peers: peerRepository,
  federation: federationClient,
  async beatStates() {
    const result = await pool.query(`SELECT id, beat_state, last_beat_at FROM federation_peers WHERE status = 'active'`);
    return new Map(result.rows.map(row => [row.id as string, { state: row.beat_state, at: row.last_beat_at ?? null }]));
  },
  loadHomeUnit: async () => toPeerProfile(await loadUnitProfile()),
  userTimeZone: loadUserTimeZone,
});
