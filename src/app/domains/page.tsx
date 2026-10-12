import { requireAdmin } from '@/app/lib/domain-access';
import DomainsPageClient from './DomainsPageClient';

export default async function DomainsPage() {
  await requireAdmin();

  return <DomainsPageClient />;
}
