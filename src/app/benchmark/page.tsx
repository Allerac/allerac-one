import { requireAdmin } from '@/app/lib/domain-access';
import BenchmarkClient from './BenchmarkClient';

export default async function BenchmarkPage() {
  const user = await requireAdmin();

  return <BenchmarkClient userId={user.id} />;
}
