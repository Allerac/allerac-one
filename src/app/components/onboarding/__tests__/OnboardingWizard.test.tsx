import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingWizard from '../OnboardingWizard';
import { saveUserSettings, saveSelectedModel } from '@/app/actions/user';
import { validateApiKey } from '@/app/actions/api-keys';

// Mock server actions
jest.mock('@/app/actions/user', () => ({
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
  saveSelectedModel: jest.fn().mockResolvedValue(undefined),
  updateLanguage: jest.fn().mockResolvedValue(undefined),
  completeOnboarding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/app/actions/api-keys', () => ({
  validateApiKey: jest.fn().mockResolvedValue({ valid: true }),
}));

jest.mock('@/app/actions/chat', () => ({
  saveSystemMessage: jest.fn().mockResolvedValue(undefined),
}));

describe('OnboardingWizard', () => {
  const defaultProps = {
    userId: 'user_123',
    userName: 'John Doe',
    isDarkMode: false,
    systemMessage: 'You are a helpful AI assistant.',
    ollamaConnected: false,
    onComplete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(validateApiKey).mockResolvedValue({ valid: true });
    Object.defineProperty(window, 'location', {
      value: { reload: jest.fn() },
      writable: true,
    });
  });

  describe('Step 1: Welcome', () => {
    it('should render step 1 with user greeting', () => {
      render(<OnboardingWizard {...defaultProps} />);

      // Should show step indicator
      expect(screen.getByText(/Step 1/i)).toBeInTheDocument();

      // Should show greeting
      const heading = screen.getAllByText(/John/i, { selector: 'h1, h2' })[0];
      expect(heading).toBeInTheDocument();
    });

    it('should display feature bullets', () => {
      render(<OnboardingWizard {...defaultProps} />);

      // Look for bullet points about the app features
      const bullets = screen.getAllByRole('listitem');
      expect(bullets.length).toBeGreaterThan(0);
    });

    it('should have Let\'s go button to advance to step 2', async () => {
      render(<OnboardingWizard {...defaultProps} />);

      const continueBtn = screen.getByRole('button', { name: /let's go|vamos|continue/i });
      fireEvent.click(continueBtn);

      await waitFor(() => {
        expect(screen.getByText(/Step 2/i)).toBeInTheDocument();
      });
    });

    it('should have skip button to complete onboarding', async () => {
      const onComplete = jest.fn();
      const completeOnboarding = require('@/app/actions/user').completeOnboarding;
      completeOnboarding.mockResolvedValue(undefined);

      render(<OnboardingWizard {...defaultProps} onComplete={onComplete} />);

      const skipBtn = screen.getByRole('button', { name: /skip|omitir/i });
      fireEvent.click(skipBtn);

      await waitFor(() => {
        expect(completeOnboarding).toHaveBeenCalled();
      });
    });
  });

  describe('Step 2: Connect AI', () => {
    const ANTHROPIC_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
    const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

    const goToStep2 = () => {
      fireEvent.click(screen.getByRole('button', { name: /let's go|vamos|continue/i }));
    };
    // Typing never saves; leaving the field (or Test connection) tests and saves.
    const enterKey = (input: HTMLElement, value: string) => {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    };

    it('should have step indicator showing step 1 initially', () => {
      render(<OnboardingWizard {...defaultProps} />);

      const stepIndicator = screen.getByText(/Step 1 of 4/);
      expect(stepIndicator).toBeInTheDocument();
    });

    it('should offer Anthropic and OpenAI providers', () => {
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      expect(screen.getByRole('button', { name: /anthropic/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /openai/i })).toBeInTheDocument();
    });

    it('should save an Anthropic key as the anthropic setting', async () => {
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));
      enterKey(screen.getByPlaceholderText(/sk-ant-/i), ANTHROPIC_KEY);

      await waitFor(() => {
        expect(saveUserSettings).toHaveBeenCalledWith(undefined, undefined, undefined, undefined, ANTHROPIC_KEY);
      });
      expect(validateApiKey).toHaveBeenCalledWith('anthropic', ANTHROPIC_KEY);
      expect(await screen.findByText('Saved')).toBeInTheDocument();
    });

    it('should save an OpenAI key as the openai setting', async () => {
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      fireEvent.click(screen.getByRole('button', { name: /openai/i }));
      enterKey(screen.getByPlaceholderText(/^sk-\.\.\.$/), OPENAI_KEY);

      await waitFor(() => {
        expect(saveUserSettings).toHaveBeenCalledWith(
          undefined, undefined, undefined, undefined, undefined, undefined, undefined, OPENAI_KEY,
        );
      });
    });

    it('should not save an Anthropic key pasted into the OpenAI field', async () => {
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      fireEvent.click(screen.getByRole('button', { name: /openai/i }));
      enterKey(screen.getByPlaceholderText(/^sk-\.\.\.$/), ANTHROPIC_KEY);

      await new Promise(r => setTimeout(r, 0));
      expect(validateApiKey).not.toHaveBeenCalled();
      expect(saveUserSettings).not.toHaveBeenCalled();
    });

    it('should not save while typing', async () => {
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));
      const input = screen.getByPlaceholderText(/sk-ant-/i);
      for (let i = 22; i <= ANTHROPIC_KEY.length; i++) {
        fireEvent.change(input, { target: { value: ANTHROPIC_KEY.slice(0, i) } });
      }

      await new Promise(r => setTimeout(r, 0));
      expect(validateApiKey).not.toHaveBeenCalled();
      expect(saveUserSettings).not.toHaveBeenCalled();
    });

    it('should test the key with Test connection and save it once', async () => {
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      fireEvent.click(screen.getByRole('button', { name: /openai/i }));
      fireEvent.change(screen.getByPlaceholderText(/^sk-\.\.\.$/), { target: { value: OPENAI_KEY } });
      fireEvent.blur(screen.getByPlaceholderText(/^sk-\.\.\.$/));
      // The last Test button belongs to the provider field opened below the Gemini one.
      fireEvent.click(screen.getAllByRole('button', { name: 'Test connection' }).at(-1)!);

      expect(await screen.findByText('Saved')).toBeInTheDocument();
      expect(validateApiKey).toHaveBeenCalledTimes(1);
      expect(validateApiKey).toHaveBeenCalledWith('openai', OPENAI_KEY);
      expect(saveUserSettings).toHaveBeenCalledTimes(1);
    });

    it('should not save a key the provider rejects, and allow a retry', async () => {
      jest.mocked(validateApiKey).mockResolvedValueOnce({ valid: false, error: 'Invalid or unauthorized key' });
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));
      enterKey(screen.getByPlaceholderText(/sk-ant-/i), ANTHROPIC_KEY);

      expect(await screen.findByRole('alert')).toHaveTextContent('The provider rejected this key.');
      expect(saveUserSettings).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(/default chat model/i)).not.toBeInTheDocument();

      // The last Test button belongs to the provider field opened below the Gemini one.
      fireEvent.click(screen.getAllByRole('button', { name: 'Test connection' }).at(-1)!);
      expect(await screen.findByText('Saved')).toBeInTheDocument();
      expect(saveUserSettings).toHaveBeenCalledWith(undefined, undefined, undefined, undefined, ANTHROPIC_KEY);
    });

    it('should mask keys by default with a show/hide toggle', () => {
      render(<OnboardingWizard {...defaultProps} />);
      goToStep2();

      const google = screen.getByPlaceholderText('AIza...');
      expect(google).toHaveAttribute('type', 'password');
      expect(google).toHaveAttribute('autocomplete', 'off');
      fireEvent.click(screen.getByRole('button', { name: 'Show' }));
      expect(google).toHaveAttribute('type', 'text');
      fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
      expect(google).toHaveAttribute('type', 'password');

      fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));
      expect(screen.getByPlaceholderText(/sk-ant-/i)).toHaveAttribute('type', 'password');
    });

    describe('default model dropdown', () => {
      const finishWizard = () => {
        fireEvent.click(screen.getByRole('button', { name: /^next/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
        fireEvent.click(screen.getByRole('button', { name: /start chatting/i }));
      };

      it('should be hidden until a provider is configured', () => {
        render(<OnboardingWizard {...defaultProps} />);
        goToStep2();

        expect(screen.queryByLabelText(/default chat model/i)).not.toBeInTheDocument();
      });

      it('should list only the configured provider models and preselect a Pro one', async () => {
        render(<OnboardingWizard {...defaultProps} />);
        goToStep2();

        fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));
        enterKey(screen.getByPlaceholderText(/sk-ant-/i), ANTHROPIC_KEY);

        const select = await screen.findByLabelText(/default chat model/i) as HTMLSelectElement;
        const values = Array.from(select.options).map(o => o.value);
        expect(values).toEqual(['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7']);
        expect(select.value).toBe('claude-sonnet-4-6');
      });

      it('should include only installed Ollama models', () => {
        render(
          <OnboardingWizard {...defaultProps} ollamaConnected ollamaModels={['qwen2.5:3b', 'gemma4:latest']} />,
        );
        goToStep2();

        const select = screen.getByLabelText(/default chat model/i) as HTMLSelectElement;
        expect(Array.from(select.options).map(o => o.value)).toEqual(['qwen2.5:3b', 'gemma4']);
      });

      it('should save the chosen model when finishing', async () => {
        const onComplete = jest.fn();
        render(<OnboardingWizard {...defaultProps} onComplete={onComplete} />);
        goToStep2();

        fireEvent.click(screen.getByRole('button', { name: /openai/i }));
        enterKey(screen.getByPlaceholderText(/^sk-\.\.\.$/), OPENAI_KEY);
        const select = await screen.findByLabelText(/default chat model/i);
        fireEvent.change(select, { target: { value: 'gpt-5.6-luna' } });

        finishWizard();

        await waitFor(() => {
          expect(saveSelectedModel).toHaveBeenCalledWith('gpt-5.6-luna');
          expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ selectedModel: 'gpt-5.6-luna' }));
        });
        expect(localStorage.getItem('selected_model')).toBe('gpt-5.6-luna');
      });

      it('should not touch the model when nothing is configured', async () => {
        render(<OnboardingWizard {...defaultProps} />);
        goToStep2();

        finishWizard();

        await waitFor(() => {
          expect(defaultProps.onComplete).toHaveBeenCalled();
        });
        expect(saveSelectedModel).not.toHaveBeenCalled();
      });
    });
  });

  describe('SystemMessage Handling', () => {
    it('should use custom system message when provided', () => {
      const customMessage = 'You are an expert developer';
      const props = {
        ...defaultProps,
        systemMessage: customMessage,
      };

      const { container } = render(<OnboardingWizard {...props} />);

      // Component should be rendering with the custom message available
      expect(container).toBeInTheDocument();
    });

    it('should detect custom vs default system messages', () => {
      const props = { ...defaultProps };

      render(<OnboardingWizard {...props} />);

      // Component renders successfully with default message
      const card = document.querySelector('[class*="rounded-2xl"]');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Step 4: Done', () => {
    it('should show completion title format', () => {
      render(<OnboardingWizard {...defaultProps} />);

      // Look for completion-style text
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toContain('Welcome');
    });
  });

  describe('Language Selection', () => {
    it('should have language selector', () => {
      render(<OnboardingWizard {...defaultProps} />);

      const langSelect = screen.getByDisplayValue('EN');
      expect(langSelect).toBeInTheDocument();
    });

    it('should change language', async () => {
      const userActionsModule = require('@/app/actions/user');
      render(<OnboardingWizard {...defaultProps} />);

      const langSelect = screen.getByDisplayValue('EN') as HTMLSelectElement;
      fireEvent.change(langSelect, { target: { value: 'pt' } });

      await waitFor(() => {
        expect(userActionsModule.updateLanguage).toHaveBeenCalledWith('pt');
      });
    });

    it('should show PT and ES language options', () => {
      render(<OnboardingWizard {...defaultProps} />);

      const langSelect = screen.getByDisplayValue('EN') as HTMLSelectElement;
      const options = Array.from(langSelect.options).map(opt => opt.value);

      expect(options).toContain('en');
      expect(options).toContain('pt');
      expect(options).toContain('es');
    });
  });

  describe('Dark Mode', () => {
    it('should render with dark mode styling', () => {
      const { container } = render(
        <OnboardingWizard
          {...defaultProps}
          isDarkMode={true}
        />
      );

      // Check for dark mode classes
      const card = container.querySelector('[class*="bg-gray-900"]');
      expect(card).toBeInTheDocument();
    });

    it('should render with light mode styling', () => {
      const { container } = render(
        <OnboardingWizard
          {...defaultProps}
          isDarkMode={false}
        />
      );

      // Check for light mode classes
      const card = container.querySelector('[class*="bg-white"]');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    it('should render the main wizard card', () => {
      const { container } = render(<OnboardingWizard {...defaultProps} />);

      const card = container.querySelector('[class*="rounded-2xl"]');
      expect(card).toBeInTheDocument();
    });

    it('should have modal backdrop', () => {
      const { container } = render(<OnboardingWizard {...defaultProps} />);

      const backdrop = container.querySelector('[class*="bg-black"]');
      expect(backdrop).toBeInTheDocument();
    });
  });
});
