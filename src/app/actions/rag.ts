'use server';

import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { requireCurrentUser } from '@/app/lib/auth-session';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export async function getRelevantContext(query: string) {
    try {
        const user = await requireCurrentUser();
        const [settings, systemSettings] = await Promise.all([
            userSettingsService.loadUserSettings(user.id),
            systemSettingsService.loadAll(),
        ]);
        const token = settings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN || '';
        const embeddingService = new EmbeddingService(token);
        const vectorService = new VectorSearchService(embeddingService);
        return await vectorService.getRelevantContext(query, user.id);
    } catch (error: unknown) {
        console.error('[RAG] Error getting context:', error instanceof Error ? error.message : error);
        throw error;
    }
}
