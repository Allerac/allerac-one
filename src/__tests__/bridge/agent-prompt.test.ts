import { buildAgentPrompt } from '@/app/bridge/agent-prompt';
import type { ApiConsoleEndpoint } from '@/app/components/settings/ApiConsole';

const endpoints: ApiConsoleEndpoint[] = [
  { id: 'garmin-status', provider: 'garmin', method: 'GET', path: '/api/v1/health/proxy/status', label: 'Connection status' },
  {
    id: 'garmin-activities',
    provider: 'garmin',
    method: 'GET',
    path: '/api/v1/health/proxy/activities',
    label: 'Activities for a day',
    params: [
      { name: 'date', required: true, placeholder: 'YYYY-MM-DD' },
      { name: 'limit', required: false, placeholder: '20' },
    ],
  },
];

describe('buildAgentPrompt', () => {
  it('never includes a literal API key', () => {
    const prompt = buildAgentPrompt(endpoints, 'http://localhost:8080');

    expect(prompt).not.toMatch(/alr_live_/);
    expect(prompt).toContain('<ALLERAC_API_KEY>');
    expect(prompt).toContain('environment variable');
  });

  it('documents each endpoint with its base URL and required params', () => {
    const prompt = buildAgentPrompt(endpoints, 'http://localhost:8080');

    expect(prompt).toContain('GET /api/v1/health/proxy/status');
    expect(prompt).toContain('GET /api/v1/health/proxy/activities');
    expect(prompt).toContain('`date` (required)');
    expect(prompt).toContain('`limit` (optional)');
    expect(prompt).toContain('curl -H "Authorization: Bearer $ALLERAC_API_KEY"');
    expect(prompt).toContain('"http://localhost:8080/api/v1/health/proxy/activities?date=YYYY-MM-DD"');
  });

  it('produces no endpoint sections when nothing is connected', () => {
    const prompt = buildAgentPrompt([], 'http://localhost:8080');

    expect(prompt).not.toContain('GET ');
    expect(prompt).toContain('## Endpoints');
  });

  it('embeds a real token directly when one is provided, with no placeholder left', () => {
    const prompt = buildAgentPrompt(endpoints, 'http://localhost:8080', {
      value: 'alr_live_abc123',
      expiresAt: '2026-08-01T18:00:00.000Z',
    });

    expect(prompt).toContain('Authorization: Bearer alr_live_abc123');
    expect(prompt).toContain('curl -H "Authorization: Bearer alr_live_abc123"');
    expect(prompt).not.toContain('<ALLERAC_API_KEY>');
    expect(prompt).not.toContain('$ALLERAC_API_KEY');
    expect(prompt).not.toContain('environment variable');
  });
});
