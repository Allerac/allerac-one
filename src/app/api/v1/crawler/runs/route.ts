import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { apiData } from '@/app/api/v1/_lib/responses';
import { crawlerRouteError, jsonBody } from '../_route';
import { createCrawlerRunSchema } from '@/app/services/crawler/crawler.schemas';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('crawler:runs:write', request);
    const input = createCrawlerRunSchema.parse(await jsonBody(request));
    const run = await new CrawlerService().createRun(user.id, input.sourceId, input.maxPages);
    return apiData({ run }, { status: 202 });
  } catch (error) {
    return crawlerRouteError('create crawler run', error);
  }
}

