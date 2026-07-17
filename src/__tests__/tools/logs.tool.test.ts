/** @jest-environment node */

import { buildLogsTool } from '@/app/tools/logs.tool';
import { logBuffer } from '@/lib/logger';

describe('buildLogsTool', () => {
  beforeEach(() => {
    logBuffer.push({ id: logBuffer.nextId(), ts: '00:00:00.000', level: 'log', context: 'Test', message: 'a log line' });
  });

  it('denies read_logs for non-admin users', async () => {
    const result = await buildLogsTool(false).read_logs({});

    expect(result).toEqual({ error: 'read_logs requires an admin user' });
  });

  it('returns buffer entries for admin users', async () => {
    const result = await buildLogsTool(true).read_logs({});

    expect(result.returned).toBeGreaterThan(0);
    expect(result.entries[0]).toHaveProperty('message');
  });
});
