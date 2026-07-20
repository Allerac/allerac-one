import fs from 'fs/promises';
import path from 'path';

export interface BuildInfo {
  commit: string;
  date: string;
  release: string;
}

const UNKNOWN_BUILD_INFO: BuildInfo = {
  commit: 'unknown',
  date: 'unknown',
  release: 'unreleased',
};

export async function readBuildInfo(): Promise<BuildInfo> {
  try {
    const buildInfoPath = path.join(process.cwd(), 'build-info.json');
    const data: unknown = JSON.parse(await fs.readFile(buildInfoPath, 'utf-8'));
    if (!data || typeof data !== 'object') return UNKNOWN_BUILD_INFO;

    const record = data as Record<string, unknown>;
    return {
      commit: typeof record.commit === 'string' && record.commit
        ? record.commit
        : UNKNOWN_BUILD_INFO.commit,
      date: typeof record.date === 'string' && record.date
        ? record.date
        : UNKNOWN_BUILD_INFO.date,
      release: typeof record.release === 'string' && record.release
        ? record.release
        : UNKNOWN_BUILD_INFO.release,
    };
  } catch {
    return UNKNOWN_BUILD_INFO;
  }
}

