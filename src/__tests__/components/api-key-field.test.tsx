import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApiKeyField from '@/app/components/settings/ApiKeyField';
import { validateApiKey } from '@/app/actions/api-keys';

jest.mock('@/app/actions/api-keys', () => ({ validateApiKey: jest.fn() }));

const baseProps = {
  label: 'OpenAI API Key',
  placeholder: 'sk-...',
  provider: 'openai' as const,
  isDarkMode: false,
};

describe('ApiKeyField with a stored value', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the masked hint and tests the stored key through the callback', async () => {
    const onTestStored = jest.fn().mockResolvedValue({ valid: true });
    render(
      <ApiKeyField
        {...baseProps}
        hasStoredValue
        storedHint="••••1234"
        value=""
        onChange={jest.fn()}
        onTestStored={onTestStored}
      />,
    );
    expect(screen.getByPlaceholderText('••••1234')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getByText('✓ Valid')).toBeInTheDocument());
    expect(onTestStored).toHaveBeenCalledTimes(1);
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it('tests a newly typed key directly', async () => {
    jest.mocked(validateApiKey).mockResolvedValue({ valid: false, error: 'Bad key' });
    const onTestStored = jest.fn();
    render(
      <ApiKeyField
        {...baseProps}
        hasStoredValue
        storedHint={null}
        value="sk-new"
        onChange={jest.fn()}
        onTestStored={onTestStored}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getByText('Bad key')).toBeInTheDocument());
    expect(validateApiKey).toHaveBeenCalledWith('openai', 'sk-new');
    expect(onTestStored).not.toHaveBeenCalled();
  });

  it('marks the stored value for removal', () => {
    const onClear = jest.fn();
    const { rerender } = render(
      <ApiKeyField {...baseProps} hasStoredValue storedHint={null} value="" onChange={jest.fn()} onClear={onClear} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    rerender(
      <ApiKeyField {...baseProps} hasStoredValue storedHint={null} value="" onChange={jest.fn()} onClear={onClear} clearPending />,
    );
    expect(screen.getByPlaceholderText('Will be removed on save')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByText('Configured')).toBeNull();
  });

  it('keeps the original placeholder when no hint is provided', () => {
    render(<ApiKeyField {...baseProps} hasStoredValue value="" onChange={jest.fn()} />);
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
  });
});
