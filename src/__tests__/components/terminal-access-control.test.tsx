import { fireEvent, render, screen } from '@testing-library/react';
import TerminalAccessControl from '@/app/admin/TerminalAccessControl';
import en from '@/i18n/messages/en.json';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (en.terminal.adminAccess as Record<string, string>)[key] ?? key,
}));

test('explains that granted users share the same session and its CLI logins', () => {
  render(<TerminalAccessControl enabled={false} busy={false} isDark={false} onToggle={() => {}} />);
  expect(screen.getByRole('note')).toHaveTextContent(/same terminal session/);
  expect(screen.getByRole('note')).toHaveTextContent(/pasted/);
  expect(screen.getByRole('note')).toHaveTextContent(/CLI accounts/);
  expect(screen.getByText(/administrators included/)).toBeInTheDocument();
});

test('toggles the grant and shows the current state', () => {
  const onToggle = jest.fn();
  const { rerender } = render(<TerminalAccessControl enabled={false} busy={false} isDark onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: 'Grant terminal access' }));
  expect(onToggle).toHaveBeenCalledTimes(1);
  rerender(<TerminalAccessControl enabled busy={false} isDark onToggle={onToggle} />);
  expect(screen.getByRole('button', { name: 'Revoke terminal access' })).toBeInTheDocument();
  rerender(<TerminalAccessControl enabled busy isDark onToggle={onToggle} />);
  expect(screen.getByRole('button')).toBeDisabled();
});
