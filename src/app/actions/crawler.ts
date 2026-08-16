'use server';

import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { CrawlerService } from '@/app/services/crawler/crawler.service';

const crawlerService = new CrawlerService();

async function requireCrawlerUser() {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, 'memory');
  return user;
}

export async function getCrawlerDashboard() {
  const user = await requireCrawlerUser();
  const [sources, runs] = await Promise.all([
    crawlerService.listSources(user.id),
    crawlerService.listRuns(user.id),
  ]);
  return { sources, runs };
}

export async function startCrawlerRun(sourceId: string, maxPages?: number | null) {
  const user = await requireCrawlerUser();
  if (!sourceId) throw new Error('Crawler source is required');
  if (maxPages != null && (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10_000)) {
    throw new Error('Max pages must be between 1 and 10,000');
  }
  return crawlerService.createRun(user.id, sourceId, maxPages);
}
