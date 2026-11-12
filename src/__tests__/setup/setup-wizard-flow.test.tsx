/**
 * First-run setup, client side: the wizard must survive the route refreshes
 * triggered by its own server actions, send the same password pre-hash as the
 * login form, surface errors, and only finish setup on the last step.
 */
import { createHash } from 'crypto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
  getOllamaModels: jest.fn(),
  testOllamaConnection: jest.fn(),
  saveLocale: jest.fn(),
  saveDefaultModel: jest.fn(),
  markSetupComplete: jest.fn(),
}));

import LoginClient from '@/app/login/LoginClient';
import SetupWizard from '@/app/components/setup/SetupWizard';
import * as authActions from '@/app/actions/auth';
import * as setupActions from '@/app/actions/setup';

const auth = jest.mocked(authActions);
const setup = jest.mocked(setupActions);
const admin = { id: 'u1', email: 'admin@example.com', name: 'Admin', is_admin: true, created_at: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  setup.getOllamaModels.mockResolvedValue({ success: false, error: 'offline' });
  setup.saveLocale.mockResolvedValue();
  setup.markSetupComplete.mockResolvedValue();
});

describe('SetupWizard', () => {
  it('registers with the login pre-hash, then cannot go back to the account step', async () => {
    auth.register.mockResolvedValue({ success: true, user: admin });
    render(<SetupWizard onComplete={jest.fn()} />);

    const [password, confirm] = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
    fireEvent.change(document.querySelector('input[type="email"]')!, { target: { value: 'admin@example.com' } });
    fireEvent.change(password, { target: { value: 'password123' } });
    fireEvent.change(confirm, { target: { value: 'password123' } });
    await act(async () => { fireEvent.click(screen.getByText('next')); });

    const expected = createHash('sha256').update('password123').digest('hex');
    expect(auth.register).toHaveBeenCalledWith('admin@example.com', expected, undefined);
    await screen.findByText('step2Description');
    expect(screen.queryByText('back')).toBeNull();
  });

  it('shows an error instead of failing silently when a step throws', async () => {
    setup.saveLocale.mockRejectedValue(new Error('network'));
    render(<SetupWizard onComplete={jest.fn()} accountCreated />);
    await act(async () => { fireEvent.click(screen.getByText('next')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('unexpectedError');
    expect(screen.getByText('step2Description')).toBeInTheDocument();
  });

  it('completes setup only on finish, then hands control back', async () => {
    const markComplete = setup.markSetupComplete;
    const onComplete = jest.fn();
    render(<SetupWizard onComplete={onComplete} accountCreated />);

    await act(async () => { fireEvent.click(screen.getByText('next')); });
    await screen.findByText('step3Description');
    await act(async () => { fireEvent.click(screen.getByText('next')); });
    await screen.findByText('finish');
    expect(markComplete).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByText('finish')); });
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(markComplete).toHaveBeenCalledTimes(1);
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
