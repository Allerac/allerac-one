import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { apiData } from '@/app/api/v1/_lib/responses';
import { crawlerRouteError, jsonBody } from '../_route';
import { crawlerSourceSchema } from '@/app/services/crawler/crawler.schemas';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('crawler:sources:write', request);
    const input = crawlerSourceSchema.parse(await jsonBody(request));
    const source = await new CrawlerService().upsertSource(user.id, input);
    return apiData({ source });
  } catch (error) {
    return crawlerRouteError('upsert crawler source', error);
  }
}

