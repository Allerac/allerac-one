/** Default, DB-backed StatusService wiring (federation P4d). */
import { readBuildInfo } from '@/app/lib/build-info';
import { StatusService } from './status.service';
import { statusRepository } from './status.repository';
import { loadUnitProfile } from './unit-profile.repository';

export const statusService = new StatusService({
  source: statusRepository,
  async unit() {
    const [profile, build] = await Promise.all([loadUnitProfile(), readBuildInfo()]);
    return {
      name: profile.name, displayName: profile.displayName, emoji: profile.emoji, role: profile.role,
      appVersion: build.release ?? null, commit: build.commit ?? null,
    };
  },
});
