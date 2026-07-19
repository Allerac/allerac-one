import { requireAuthenticatedUser } from '@/app/lib/domain-access';
import ConfigPageClient from './ConfigPageClient';

export default async function ConfigPage() {
  const user = await requireAuthenticatedUser();

  return (
    <ConfigPageClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
    />
  );
}
