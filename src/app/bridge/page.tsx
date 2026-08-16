import { requireDomainAccess } from '@/app/lib/domain-access';
import BridgeClient from './BridgeClient';

export default async function BridgePage() {
  const user = await requireDomainAccess('bridge');

  return (
    <BridgeClient userId={user.id} userName={user.name} userEmail={user.email} />
  );
}
