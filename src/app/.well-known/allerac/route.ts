import { readBuildInfo } from '@/app/lib/build-info';
import { buildManifest, isManifestEnabled } from '@/federation/manifest';
import { federationManifestSchema } from '@/federation/manifest.schema';

export const dynamic = 'force-dynamic';

/** Public federation manifest. No authentication, no database access. */
export async function GET(request: Request): Promise<Response> {
  if (!isManifestEnabled()) {
    return Response.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });
  }

  const { release } = await readBuildInfo();
  const manifest = federationManifestSchema.parse(buildManifest({ requestUrl: request.url, release }));

  return Response.json(manifest, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
