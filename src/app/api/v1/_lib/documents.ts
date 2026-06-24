import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export async function resolveEmbeddingToken(userId: string): Promise<string> {
  const [userSettings, systemSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);
  return userSettings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN || '';
}

export function documentDto(row: any) {
  return {
    id: row.id,
    filename: row.filename,
    fileType: row.file_type,
    fileSize: row.file_size,
    domainSlug: row.domain_slug ?? null,
    status: row.status,
    errorMessage: row.error_message ?? null,
    uploadedAt: row.uploaded_at,
  };
}
