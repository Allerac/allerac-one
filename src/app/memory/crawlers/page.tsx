import { requireDomainAccess } from '@/app/lib/domain-access';
import MemoryCrawlersClient from './MemoryCrawlersClient';

export default async function MemoryCrawlersPage() {
  await requireDomainAccess('memory');
  return <MemoryCrawlersClient />;
}
