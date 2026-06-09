import { requireDomainAccess } from '@/app/lib/domain-access';
import TicketsClient from './TicketsClient';

export default async function TicketsPage() {
  const user = await requireDomainAccess('tickets');

  return (
    <TicketsClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
    />
  );
}
