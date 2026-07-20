import { apiData } from '../_lib/responses';
import { readBuildInfo } from '@/app/lib/build-info';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const buildInfo = await readBuildInfo();

  return apiData({
    release: buildInfo.release,
    commit: buildInfo.commit,
    builtAt: buildInfo.date,
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

