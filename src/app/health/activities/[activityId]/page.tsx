import { requireDomainAccess } from '@/app/lib/domain-access';
import ActivityDetailClient from '@/app/components/health/ActivityDetailClient';

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  await requireDomainAccess('health');
  const { activityId } = await params;
  return <ActivityDetailClient activityId={activityId} />;
}
