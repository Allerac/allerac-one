import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { apiError } from '@/app/api/v1/_lib/responses';
import { crawlerRouteError, jsonBody } from '../../../_route';
import { documentBatchSchema } from '@/app/services/crawler/crawler.schemas';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireApiUser('crawler:documents:write', request);
    const headerKey = request.headers.get('idempotency-key')?.trim();
    if (!headerKey) return apiError('validation_error', 'Idempotency-Key header is required', 400);
    const { id } = await context.params;
    const batch = documentBatchSchema.parse(await jsonBody(request));
    return Response.json(await new CrawlerService().ingest(user.id, id, headerKey, batch));
  } catch (error) {
    return crawlerRouteError('ingest crawler documents', error);
  }
}

