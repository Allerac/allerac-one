import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { crawlerRouteError, jsonBody } from '../../_route';
import { runUpdateSchema } from '@/app/services/crawler/crawler.schemas';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireApiUser('crawler:runs:write', request);
    const { id } = await context.params;
    await new CrawlerService().updateRun(user.id, id, runUpdateSchema.parse(await jsonBody(request)));
    return new Response(null, { status: 204 });
  } catch (error) {
    return crawlerRouteError('update crawler run', error);
  }
}
