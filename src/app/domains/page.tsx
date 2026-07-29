import { requireAdmin } from '@/app/lib/domain-access';
import DomainsPageClient from './DomainsPageClient';

export default async function DomainsPage() {
  const user = await requireAdmin();

  return <DomainsPageClient userId={user.id} />;
}
