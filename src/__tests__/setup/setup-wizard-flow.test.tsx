/**
 * First-run setup, client side: the wizard must survive the route refreshes
 * triggered by its own server actions, send the same password pre-hash as the
 * login form, require a tested LLM provider, let optional steps be skipped,
 * resume at the first incomplete step, and only finish setup on the last step.
 */
import { createHash } from 'crypto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SetupStatus } from '@/app/actions/setup-config';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/app/actions/auth', () => ({
  register: jest.fn(),
  checkFirstRun: jest.fn(),
  login: jest.fn(),
  migratePassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  getLoginRedirect: jest.fn(),
}));
jest.mock('@/app/actions/setup', () => ({
  saveLocale: jest.fn(),
  markSetupComplete: jest.fn(),
}));
jest.mock('@/app/actions/setup-config', () => ({
  getSetupStatus: jest.fn(),
  completeSetupStep: jest.fn(),
  testLlmProvider: jest.fn(),
  saveLlmProvider: jest.fn(),
  saveGoogleApiKey: jest.fn(),
  saveEmailSettings: jest.fn(),
  saveSearchApiKey: jest.fn(),
  saveTelegramBot: jest.fn(),
}));

import LoginClient from '@/app/login/LoginClient';
import SetupWizard from '@/app/components/setup/SetupWizard';
import * as authActions from '@/app/actions/auth';
import * as setupActions from '@/app/actions/setup';
import * as setupConfigActions from '@/app/actions/setup-config';

const auth = jest.mocked(authActions);
const setup = jest.mocked(setupActions);
const config = jest.mocked(setupConfigActions);
const admin = { id: 'u1', email: 'admin@example.com', name: 'Admin', is_admin: true, created_at: new Date() };

function makeStatus(overrides: Partial<SetupStatus> = {}): SetupStatus {
  return {
    doneSteps: [],
    llm: { provider: null, model: null, keys: { openai: false, anthropic: false }, ollamaBaseUrl: 'http://ollama:11434' },
    embedding: { provider: 'ollama', model: 'embeddinggemma', dimensions: 768 },
    googleConfigured: false,
    email: { apiKeyConfigured: false, fromEmail: null },
    searchConfigured: false,
    telegram: { configured: false, botUsername: null },
    ...overrides,
  };
}

const click = async (text: string) => { await act(async () => { fireEvent.click(screen.getByText(text)); }); };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  setup.saveLocale.mockResolvedValue();
  setup.markSetupComplete.mockResolvedValue();
  config.getSetupStatus.mockResolvedValue(makeStatus());
  config.completeSetupStep.mockResolvedValue({ success: true });
});

describe('SetupWizard', () => {
  it('registers with the login pre-hash, then cannot go back to the account step', async () => {
    auth.register.mockResolvedValue({ success: true, user: admin });
    render(<SetupWizard onComplete={jest.fn()} />);

    const [password, confirm] = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
    fireEvent.change(document.querySelector('input[type="email"]')!, { target: { value: 'admin@example.com' } });
    fireEvent.change(password, { target: { value: 'password123' } });
    fireEvent.change(confirm, { target: { value: 'password123' } });
    await click('next');

    const expected = createHash('sha256').update('password123').digest('hex');
    expect(auth.register).toHaveBeenCalledWith('admin@example.com', expected, undefined);
    await screen.findByText('step2Description');
    expect(screen.queryByText('back')).toBeNull();
  });

  it('shows an error instead of failing silently when a step throws', async () => {
    setup.saveLocale.mockRejectedValue(new Error('network'));
    render(<SetupWizard onComplete={jest.fn()} accountCreated />);
    await screen.findByText('step2Description');
    await click('next');
    expect(await screen.findByRole('alert')).toHaveTextContent('unexpectedError');
    expect(screen.getByText('step2Description')).toBeInTheDocument();
  });

  it('resumes at the first incomplete step after a reload', async () => {
    config.getSetupStatus.mockResolvedValue(makeStatus({ doneSteps: ['language', 'llm', 'google'] }));
    render(<SetupWizard onComplete={jest.fn()} accountCreated />);
    expect(await screen.findByText('emailDescription')).toBeInTheDocument();
  });

  it('cannot leave the LLM step until the connection test succeeds', async () => {
    config.getSetupStatus.mockResolvedValue(makeStatus({ doneSteps: ['language'] }));
    render(<SetupWizard onComplete={jest.fn()} accountCreated />);
    await screen.findByText('llmDescription');

    // No skip on the required step, and Next is disabled before a test.
    expect(screen.queryByText('skip')).toBeNull();
    expect(screen.getByText('next')).toBeDisabled();

    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'sk-bad' } });
    config.testLlmProvider.mockResolvedValueOnce({ success: false, error: 'Invalid or unauthorized key' });
    await click('testConnection');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or unauthorized key');
    expect(screen.getByText('next')).toBeDisabled();

    config.testLlmProvider.mockResolvedValueOnce({
      success: true,
      models: [
        { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'fast', available: true },
        { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', description: 'pro', available: true },
      ],
      defaultModel: 'gpt-5.6-luna',
    });
    config.saveLlmProvider.mockResolvedValue({ success: true, model: 'gpt-5.6-sol' });
    await click('retryConnection');
    await screen.findByText(/connectionSuccess/);
    await click('GPT-5.6 Sol');
    expect(screen.getByText('next')).not.toBeDisabled();
    await click('next');

    expect(config.testLlmProvider).toHaveBeenLastCalledWith('openai', 'sk-bad');
    expect(config.saveLlmProvider).toHaveBeenCalledWith({ provider: 'openai', apiKey: 'sk-bad', model: 'gpt-5.6-sol' });
    expect(localStorage.getItem('selected_model')).toBe('gpt-5.6-sol');
    expect(await screen.findByText('googleDescription')).toBeInTheDocument();
  });

  it('a changed key needs a new test', async () => {
    config.getSetupStatus.mockResolvedValue(makeStatus({ doneSteps: ['language'] }));
    config.testLlmProvider.mockResolvedValue({
      success: true,
      models: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'fast', available: true }],
      defaultModel: 'gpt-5.6-luna',
    });
    render(<SetupWizard onComplete={jest.fn()} accountCreated />);
    await screen.findByText('llmDescription');
    const key = document.querySelector('input[type="password"]')!;
    fireEvent.change(key, { target: { value: 'sk-1' } });
    await click('testConnection');
    await screen.findByText(/connectionSuccess/);
    fireEvent.change(key, { target: { value: 'sk-2' } });
    expect(screen.getByText('next')).toBeDisabled();
  });

  it('optional steps can be skipped without saving anything', async () => {
    config.getSetupStatus.mockResolvedValue(makeStatus({ doneSteps: ['language', 'llm'] }));
    render(<SetupWizard onComplete={jest.fn()} accountCreated />);

    for (const description of ['googleDescription', 'emailDescription', 'searchDescription', 'telegramDescription']) {
      await screen.findByText(description);
      await click('skip');
    }
    expect(config.completeSetupStep.mock.calls.map(c => c[0])).toEqual(['google', 'email', 'search', 'telegram']);
    expect(config.saveGoogleApiKey).not.toHaveBeenCalled();
    expect(config.saveEmailSettings).not.toHaveBeenCalled();
    expect(config.saveSearchApiKey).not.toHaveBeenCalled();
    expect(config.saveTelegramBot).not.toHaveBeenCalled();
    expect(await screen.findByText('finish')).toBeInTheDocument();
  });

  it('saves an optional step and shows configured keys only as configured', async () => {
    config.getSetupStatus.mockResolvedValue(makeStatus({ doneSteps: ['language', 'llm', 'google'], email: { apiKeyConfigured: true, fromEmail: 'hi@example.com' } }));
    config.saveEmailSettings.mockResolvedValue({ success: true });
    render(<SetupWizard onComplete={jest.fn()} accountCreated />);
    await screen.findByText('emailDescription');

    const key = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(key.value).toBe('');
    expect(key.placeholder).toBe('keyConfiguredPlaceholder');
    expect(screen.getByText('keepAndContinue')).toBeInTheDocument();

    await click('saveAndContinue');
    expect(config.saveEmailSettings).toHaveBeenCalledWith({ apiKey: undefined, fromEmail: 'hi@example.com' });
    expect(await screen.findByText('searchDescription')).toBeInTheDocument();
  });

  it('completes setup only on finish, then hands control back', async () => {
    config.getSetupStatus.mockResolvedValue(makeStatus({ doneSteps: ['language', 'llm', 'google', 'email', 'search', 'telegram'] }));
    const onComplete = jest.fn();
    render(<SetupWizard onComplete={onComplete} accountCreated />);
    await screen.findByText('finish');
    expect(setup.markSetupComplete).not.toHaveBeenCalled();

    await click('finish');
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(setup.markSetupComplete).toHaveBeenCalledTimes(1);
  });
});

describe('LoginClient', () => {
  it('keeps the wizard when a refresh reports that a user now exists', async () => {
    auth.checkFirstRun.mockResolvedValue({ isFirstRun: true, userCount: 0, registrationOpen: false });

    const { rerender } = render(<LoginClient />);
    await screen.findByText('step1Description');

    // register() set the session; the refreshed /login now passes resumeSetup.
    auth.checkFirstRun.mockResolvedValue({ isFirstRun: false, userCount: 1, registrationOpen: false });
    rerender(<LoginClient resumeSetup />);
    expect(screen.getByText('step1Description')).toBeInTheDocument();
  });

  it('resumes after the account step when reloaded mid-setup', async () => {
    auth.checkFirstRun.mockResolvedValue({ isFirstRun: false, userCount: 1, registrationOpen: false });
    render(<LoginClient resumeSetup />);
    expect(await screen.findByText('step2Description')).toBeInTheDocument();
  });
});
