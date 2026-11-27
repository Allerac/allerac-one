/** @jest-environment node */
const mockAdmin = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockArchive = jest.fn();
const mockUnarchive = jest.fn();
const mockGet = jest.fn();
jest.mock('@/app/api/v1/_lib/auth', () => ({ requireSessionAdmin: () => mockAdmin() }));
jest.mock('@/app/services/agent/unit-agents.repository', () => {
  const actual = jest.requireActual('@/app/services/agent/unit-agents.repository');
  return {
    UnitAgentError: actual.UnitAgentError,
    listUnitAgents: jest.fn(),
    createUnitAgent: (...args: unknown[]) => mockCreate(...args),
    updateUnitAgent: (...args: unknown[]) => mockUpdate(...args),
    archiveUnitAgent: (...args: unknown[]) => mockArchive(...args),
    unarchiveUnitAgent: (...args: unknown[]) => mockUnarchive(...args),
    getUnitAgent: (...args: unknown[]) => mockGet(...args),
  };
});

import { POST } from '@/app/api/v1/unit/agents/route';
import { PATCH } from '@/app/api/v1/unit/agents/[slug]/route';
import { UnitAgentError } from '@/app/services/agent/unit-agents.repository';

const json = (method: string, body: unknown) => new Request('http://x/api/v1/unit/agents', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('bot management API', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ALLERAC_BOTS = 'true';
    mockAdmin.mockResolvedValue({ id: 'admin-1' });
  });
  afterEach(() => { process.env = { ...env }; });

  it('creates a bot as the admin', async () => {
    mockCreate.mockResolvedValueOnce({ slug: 'doctor' });
    const response = await POST(json('POST', { slug: 'doctor', displayName: 'Doctor', toolSettings: { modules: { health: true } } }));
    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ slug: 'doctor', displayName: 'Doctor' }), 'admin-1');
  });

  it('is off without the flag', async () => {
    delete process.env.ALLERAC_BOTS;
    expect((await POST(json('POST', { slug: 'doctor', displayName: 'Doctor' }))).status).toBe(404);
    expect((await PATCH(json('PATCH', { role: 'x' }), ctx('doctor'))).status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses non-admins before anything else', async () => {
    const { ForbiddenError } = jest.requireActual('@/app/lib/auth-session');
    mockAdmin.mockRejectedValue(new ForbiddenError('Admin access required'));
    expect((await POST(json('POST', { slug: 'doctor', displayName: 'Doctor' }))).status).toBe(403);
    expect((await PATCH(json('PATCH', { archived: true }), ctx('doctor'))).status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it('validates input and maps registry errors', async () => {
    expect((await POST(json('POST', { slug: 'health', displayName: 'H' }))).status).toBe(400);
    mockCreate.mockRejectedValueOnce(new UnitAgentError('slug_taken', 'taken'));
    const taken = await POST(json('POST', { slug: 'doctor', displayName: 'Doctor' }));
    expect(taken.status).toBe(409);
    expect((await taken.json()).error.code).toBe('slug_taken');
  });

  it('edits, archives and restores', async () => {
    mockUpdate.mockResolvedValueOnce({ slug: 'doctor', role: 'gp' });
    const edited = await PATCH(json('PATCH', { role: 'gp' }), ctx('doctor'));
    expect(edited.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('doctor', { role: 'gp' }, 'admin-1');

    mockArchive.mockResolvedValueOnce({ slug: 'doctor', archivedAt: 'x' });
    await PATCH(json('PATCH', { archived: true }), ctx('doctor'));
    expect(mockArchive).toHaveBeenCalledWith('doctor', 'admin-1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    mockUnarchive.mockResolvedValueOnce({ slug: 'doctor', archivedAt: null });
    await PATCH(json('PATCH', { archived: false }), ctx('doctor'));
    expect(mockUnarchive).toHaveBeenCalledWith('doctor', 'admin-1');
  });

  it('rejects slug changes and reports the locked default bot', async () => {
    expect((await PATCH(json('PATCH', { slug: 'other' }), ctx('doctor'))).status).toBe(400);
    mockUpdate.mockRejectedValueOnce(new UnitAgentError('default_agent_locked', 'locked', { fields: ['instructions'] }));
    const locked = await PATCH(json('PATCH', { instructions: 'x' }), ctx('chat'));
    expect(locked.status).toBe(409);
  });
});
