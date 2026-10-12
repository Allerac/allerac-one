import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { crawlerRouteError, jsonBody } from '../../../_route';
import { heartbeatSchema } from '@/app/services/crawler/crawler.schemas';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireApiUser('crawler:runs:heartbeat', request);
    const { id } = await context.params;
    const input = heartbeatSchema.parse(await jsonBody(request));
    await new CrawlerService().heartbeat(user.id, id, input);
    return new Response(null, { status: 204 });
  } catch (error) {
    return crawlerRouteError('heartbeat crawler run', error);
  }
}

