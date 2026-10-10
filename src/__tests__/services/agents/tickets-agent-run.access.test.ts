/** @jest-environment node */

// Tickets -> PR flow: TicketsClient.startTicket -> POST /api/agents (skillName,
// domain "tickets") -> agent_runs row owned by the clicking user -> agent-worker
// WorkerRunnerService.executeSkillRun -> WorkerService with ALL tools and the
// system github_repo_token. These tests run that path with the real runner and
// worker, mocking only the LLM, the executor client and the GitHub API client.

const mockChatCompletion = jest.fn();
const mockShellExecute = jest.fn();
const mockCreatePr = jest.fn();
const mockBuildGithubTools = jest.fn();

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'worker-1') }));
jest.mock('@/app/services/llm/llm.service', () => ({
  LLMService: jest.fn().mockImplementation(() => ({ chatCompletion: mockChatCompletion })),
}));
jest.mock('@/app/tools/shell.tool', () => ({
  ShellTool: jest.fn().mockImplementation(() => ({ execute: mockShellExecute })),
}));
jest.mock('@/app/tools/github.tool', () => {
  const actual = jest.requireActual('@/app/tools/github.tool');
  return { ...actual, buildGithubTools: (token: string) => mockBuildGithubTools(token) };
});

import { WorkerRunnerService } from '@/app/services/agents/worker-runner.service';
import type { AgentRunRecord, WorkerRunRepository } from '@/app/services/agents/worker-run.repository';
import { ShellTool } from '@/app/tools/shell.tool';

interface ToolDef { function: { name: string } }
interface ChatMessage { role: string; content: string; tool_call_id?: string }

function ticketRun(): AgentRunRecord {
  return {
    id: 'run-ticket-1',
    conversation_id: 'conv-1',
    user_id: 'user-1',
    status: 'pending',
    prompt: 'Investigate and fix this bug [Ticket #42]: "Login broken"',
    plan: null,
    result: null,
    error_message: null,
    started_at: new Date(),
    completed_at: null,
    cancelled_at: null,
    last_heartbeat: new Date(),
    llm_model: 'test-model',
    llm_provider: 'ollama',
    skill_id: 'skill-bug-hunter',
    parent_run_id: null,
    domain_slug: 'tickets',
  } as AgentRunRecord;
}

function repository(isAdmin: boolean): WorkerRunRepository {
  return {
    getUserSettings: jest.fn().mockResolvedValue({
      github_token: null,
      github_repo_token: 'repo-token',
      tavily_api_key: null,
      google_api_key: null,
      anthropic_api_key: null,
      system_message: null,
      is_admin: isAdmin,
    }),
    getSkillContent: jest.fn().mockResolvedValue('# Bug Hunter\nRepo at /workspace/projects/{{USER_ID}}/allerac-one'),
    updateRunStatus: jest.fn().mockResolvedValue(undefined),
    updateRunHeartbeat: jest.fn().mockResolvedValue(undefined),
    isRunCancelled: jest.fn().mockResolvedValue(false),
    createWorkers: jest.fn().mockResolvedValue(undefined),
    updateWorkerStatus: jest.fn().mockResolvedValue(undefined),
    appendWorkerProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as WorkerRunRepository;
}

function shellAndPrThenAnswer() {
  mockChatCompletion
    .mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: '', tool_calls: [
        { id: 'c1', function: { name: 'execute_shell', arguments: JSON.stringify({ command: 'git status' }) } },
        { id: 'c2', function: { name: 'github_create_pr', arguments: JSON.stringify({ title: 'fix', head: 'fix/42-login' }) } },
      ] } }],
    })
    .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'PR opened' } }] });
}

async function runTicket(isAdmin: boolean) {
  const runner = new WorkerRunnerService({ repository: repository(isAdmin) });
  await (runner as unknown as { executeRun(run: AgentRunRecord): Promise<void> }).executeRun(ticketRun());
  const offered = (mockChatCompletion.mock.calls[0][0].tools as ToolDef[]).map(tool => tool.function.name);
  const toolMessages = (mockChatCompletion.mock.calls[1][0].messages as ChatMessage[])
    .filter(message => message.role === 'tool');
  return { offered, toolMessages };
}

describe('tickets agent run (bug-hunter / programmer skill) access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SHELL_ALLOWED_USER_IDS;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockShellExecute.mockResolvedValue({ stdout: 'clean', stderr: '', exitCode: 0, success: true });
    mockCreatePr.mockResolvedValue({ pr_number: 7, url: 'https://github.com/Allerac/allerac-one/pull/7' });
    mockBuildGithubTools.mockImplementation(() => ({ github_create_pr: mockCreatePr }));
  });

  afterEach(() => jest.restoreAllMocks());

  it('admin-owned ticket run keeps shell and GitHub (system repo token) access', async () => {
    shellAndPrThenAnswer();

    const { offered, toolMessages } = await runTicket(true);

    expect(offered).toEqual(expect.arrayContaining(['execute_shell', 'github_create_pr', 'github_replace_lines']));
    expect(mockShellExecute).toHaveBeenCalledWith('git status', '/workspace/projects/user-1', undefined);
    expect(mockBuildGithubTools).toHaveBeenCalledWith('repo-token');
    expect(mockCreatePr).toHaveBeenCalledWith({ title: 'fix', head: 'fix/42-login' });
    expect(JSON.parse(toolMessages[1].content)).toEqual(expect.objectContaining({ pr_number: 7 }));
  });

  it('non-admin ticket run gets neither shell nor GitHub tools (fail closed)', async () => {
    shellAndPrThenAnswer();

    const { offered, toolMessages } = await runTicket(false);

    expect(offered).not.toContain('execute_shell');
    expect(offered.some(name => name.startsWith('github_'))).toBe(false);
    expect(ShellTool).not.toHaveBeenCalled();
    expect(mockBuildGithubTools).not.toHaveBeenCalled();
    expect(JSON.parse(toolMessages[0].content)).toEqual({
      error: 'Shell access is restricted to administrators on this instance.',
    });
    expect(JSON.parse(toolMessages[1].content)).toEqual({
      error: 'GitHub tools are restricted to administrators on this instance.',
    });
  });
});
