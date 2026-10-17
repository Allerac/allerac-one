import { requireAdmin } from '@/app/lib/domain-access';
import { MODELS } from '@/app/services/llm/models';
import { PUBLIC_DOMAINS } from '@/app/services/chat/chat-tool-registry';
import { filterEnabledDomainSlugs } from '@/modules/registry';
import LogsClient from './LogsClient';

export default async function LogsPage() {
  const user = await requireAdmin();

  return (
    <LogsClient
      userId={String(user.id)}
      MODELS={MODELS}
      defaultModel={MODELS[0]?.id ?? 'qwen2.5:3b'}
      // Hide the BOTS tab when no public bot's module is enabled in this Unit.
      showBotsTab={filterEnabledDomainSlugs(PUBLIC_DOMAINS).length > 0}
    />
  );
}
