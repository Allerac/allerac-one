import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { crawlerRouteError, jsonBody } from '../../_route';
import { claimRunSchema } from '@/app/services/crawler/crawler.schemas';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('crawler:runs:claim', request);
    const input = claimRunSchema.parse(await jsonBody(request));
    const run = await new CrawlerService().claimRun(user.id, input.workerId);
    return run ? Response.json(run) : new Response(null, { status: 204 });
  } catch (error) {
    return crawlerRouteError('claim crawler run', error);
  }
}

