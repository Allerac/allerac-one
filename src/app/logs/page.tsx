import { requireAdmin } from '@/app/lib/domain-access';
import { MODELS } from '@/app/services/llm/models';
import LogsClient from './LogsClient';

export default async function LogsPage() {
  const user = await requireAdmin();

  return (
    <LogsClient
      userId={String(user.id)}
      MODELS={MODELS}
      defaultModel={MODELS[0]?.id ?? 'qwen2.5:3b'}
    />
  );
}
