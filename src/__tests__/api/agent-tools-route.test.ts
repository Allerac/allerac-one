/** @jest-environment node */
const mockSave = jest.fn();
const mockLoad = jest.fn();
jest.mock('@/app/api/v1/_lib/auth', () => ({ requireSessionAdmin: jest.fn().mockResolvedValue({ id: 'admin-1' }) }));
jest.mock('@/app/services/agent/agent-tool-settings.repository', () => ({
  loadAgentToolSettings: () => mockLoad(),
  saveAgentToolSettings: (input: unknown, userId: string) => mockSave(input, userId),
}));

import { GET, PUT } from '@/app/api/v1/unit/agent-tools/route';
import { requireSessionAdmin } from '@/app/api/v1/_lib/auth';
import { ForbiddenError } from '@/app/lib/auth-session';

const empty = { modules: {}, tools: {}, skills: {} };
const put = (body: unknown) => PUT(new Request('http://x/api/v1/unit/agent-tools', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

describe('/api/v1/unit/agent-tools', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.clearAllMocks(); });

  it('lists capabilities capped by ALLERAC_MODULES with their defaults', async () => {
    process.env.ALLERAC_MODULES = 'health,music';
    mockLoad.mockResolvedValueOnce(empty);
    const { data } = await (await GET()).json();
    const byId = Object.fromEntries(data.capabilities.map((c: { id: string; enabled: boolean }) => [c.id, c.enabled]));
    expect(byId).toEqual({ health: true, music: false, notes: true, memory: true, jobs: true, tickets: false });
  });

  it('saves valid toggles', async () => {
    mockSave.mockResolvedValueOnce({ ...empty, modules: { music: true } });
    const response = await put({ modules: { music: true }, tools: { send_email: false } });
    expect(response.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith({ modules: { music: true }, tools: { send_email: false } }, 'admin-1');
  });

  it.each([
    [{ modules: { music: 'yes' } }],
    [{ tools: { 'Bad Name!': true } }],
    [{ instructions: 'not here' }],
    [{ modules: [] }],
  ])('rejects invalid input %j', async (body) => {
    const response = await put(body);
    expect(response.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('requires an admin session', async () => {
    jest.mocked(requireSessionAdmin).mockRejectedValueOnce(new ForbiddenError('Admin access required'));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
