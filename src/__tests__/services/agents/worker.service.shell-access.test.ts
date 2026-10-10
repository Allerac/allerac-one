/** @jest-environment node */

const mockChatCompletion = jest.fn();
const mockShellExecute = jest.fn();

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('@/app/services/llm/llm.service', () => ({
  LLMService: jest.fn().mockImplementation(() => ({ chatCompletion: mockChatCompletion })),
}));
jest.mock('@/app/tools/shell.tool', () => ({
  ShellTool: jest.fn().mockImplementation(() => ({ execute: mockShellExecute })),
}));

import { WorkerService, WorkerExecutionConfig } from '@/app/services/agents/worker.service';
import { ShellTool } from '@/app/tools/shell.tool';


interface ToolDef { function: { name: string } }
interface ChatMessage { role: string; content: string }

const spec = { id: 'w1', name: 'Worker', task: 'list files', tools: ['execute_shell', 'search_web'] };

function config(overrides: Partial<WorkerExecutionConfig>): WorkerExecutionConfig {
  return {
    userId: 'user-1',
    githubToken: '',
    selectedModel: 'test-model',
    modelProvider: 'ollama',
    modelBaseUrl: 'http://ollama:11434',
    systemMessage: 'You are a helpful AI assistant.',
    isAdmin: false,
    ...overrides,
  };
}

function shellCallThenAnswer() {
  mockChatCompletion
    .mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: '', tool_calls: [{
        id: 'call_1',
        function: { name: 'execute_shell', arguments: JSON.stringify({ command: 'ls' }) },
      }] } }],
    })
    .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'done' } }] });
}

describe('WorkerService shell access (agent runs)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SHELL_ALLOWED_USER_IDS;
    mockShellExecute.mockResolvedValue({ stdout: 'a.txt', stderr: '', exitCode: 0, success: true });
  });

  it('does not offer or run execute_shell for a non-admin', async () => {
    shellCallThenAnswer();

    await new WorkerService().executeWorker(spec, config({ isAdmin: false }));

    const offered = mockChatCompletion.mock.calls[0][0].tools.map((tool: ToolDef) => tool.function.name);
    expect(offered).not.toContain('execute_shell');
    expect(ShellTool).not.toHaveBeenCalled();
    const toolMessage = mockChatCompletion.mock.calls[1][0].messages.find((m: ChatMessage) => m.role === 'tool');
    expect(JSON.parse(toolMessage.content)).toEqual({
      error: 'Shell access is restricted to administrators on this instance.',
    });
  });

  it('offers and runs execute_shell for an admin', async () => {
    shellCallThenAnswer();

    await new WorkerService().executeWorker(spec, config({ isAdmin: true }));

    const offered = mockChatCompletion.mock.calls[0][0].tools.map((tool: ToolDef) => tool.function.name);
    expect(offered).toContain('execute_shell');
    expect(mockShellExecute).toHaveBeenCalledWith('ls', '/workspace/projects/user-1', undefined);
  });
});
