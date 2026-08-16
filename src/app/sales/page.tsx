import { requireDomainAccess } from '@/app/lib/domain-access';
import SalesAgentClient from './SalesAgentClient';

export default async function SalesPage() {
  const user = await requireDomainAccess('sales');

  return (
    <SalesAgentClient userId={user.id} userName={user.name} userEmail={user.email} />
  );
}
