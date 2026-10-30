/** Default, DB-backed InboxService (federation P4a). */
import { PUBLIC_DOMAINS } from '@/app/services/chat/public-domains';
import { domainService } from '@/app/services/domains/domain.service';
import { federationClient } from './federation-client.instance';
import { inboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { peerRepository } from './peer.repository';
import { toPeerProfile } from './unit-profile';
import { loadUnitProfile } from './unit-profile.repository';

export const inboxService = new InboxService({
  store: inboxRepository,
  peers: peerRepository,
  federation: federationClient,
  async localAgents(user) {
    const domains = await domainService.listAccessible({ userId: user.id, isAdmin: Boolean(user.is_admin) });
    return domains
      .filter(domain => !PUBLIC_DOMAINS.includes(domain.slug))
      .map(domain => ({ slug: domain.slug, name: domain.displayName }));
  },
  loadHomeUnit: async () => toPeerProfile(await loadUnitProfile()),
});
