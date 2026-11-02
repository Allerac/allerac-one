import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { resolveTimeZone } from './timezone';

const userSettingsService = new UserSettingsService();

/** The user's timezone (setting, then ALLERAC_TIMEZONE, then server). Never throws. */
export async function loadUserTimeZone(userId: string): Promise<string> {
  try {
    const settings = await userSettingsService.loadUserSettings(userId);
    return resolveTimeZone(settings?.timezone ?? null);
  } catch {
    return resolveTimeZone(null);
  }
}
