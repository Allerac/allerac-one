import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { crawlerRouteError, jsonBody } from '../../../_route';
import { runEventSchema } from '@/app/services/crawler/crawler.schemas';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireApiUser('crawler:events:write', request);
    const { id } = await context.params;
    await new CrawlerService().addEvent(user.id, id, runEventSchema.parse(await jsonBody(request)));
    return new Response(null, { status: 204 });
  } catch (error) {
    return crawlerRouteError('create crawler event', error);
  }
}

