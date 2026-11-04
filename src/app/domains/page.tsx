import { requireAdmin } from '@/app/lib/domain-access';
import { isDomainEnabled } from '@/modules/registry';
import DomainsPageClient from './DomainsPageClient';
import { DOMAINS } from './domains-list';

export default async function DomainsPage() {
  await requireAdmin();
  // Only the domains of modules enabled in this Unit (e.g. no alleracweb/openworld on a personal Unit).
  return <DomainsPageClient enabledSlugs={DOMAINS.map(domain => domain.slug).filter(slug => isDomainEnabled(slug))} />;
}
