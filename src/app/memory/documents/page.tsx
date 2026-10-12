import { requireDomainAccess } from '@/app/lib/domain-access';
import MemoryDocumentsClient from './MemoryDocumentsClient';

export default async function MemoryDocumentsPage() {
  const user = await requireDomainAccess('memory');
  return <MemoryDocumentsClient userId={user.id} />;
}
