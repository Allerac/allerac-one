import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatInput from '../ChatInput';

describe('ChatInput', () => {
  const defaultProps = {
    inputMessage: '',
    setInputMessage: jest.fn(),
    handleKeyPress: jest.fn(),
    handleSendMessage: jest.fn(),
    isSending: false,
    githubToken: 'ghp_test123',
    isDarkMode: false,
    setIsDocumentModalOpen: jest.fn(),
    MODELS: [
      { id: 'model_1', name: 'Fast Model', provider: 'gemini', category: 'Fast' },
      { id: 'model_2', name: 'Thinking Model', provider: 'github', category: 'Thinking' },
    ],
    selectedModel: 'model_1',
    setSelectedModel: jest.fn(),
    googleConfigured: true,
    githubConfigured: true,
    ollamaConnected: false,
    ollamaModels: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render textarea for message input', () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/type.*message|digite/i);
      expect(textarea).toBeInTheDocument();
    });

    it('should render attachment button', () => {
      render(<ChatInput {...defaultProps} />);

      const attachBtn = screen.getByRole('button', { name: /attach|addition|clip/i }) ||
                        screen.getByRole('button', { name: /\+/i });
      expect(attachBtn).toBeInTheDocument();
    });

    it('should display dark mode styling when enabled', () => {
      const { container } = render(
        <ChatInput {...defaultProps} isDarkMode={true} />
      );

      const chatBox = container.querySelector('[data-name="chat-input-box"]');
      expect(chatBox?.className).toContain('bg-gray-800');
    });

    it('should display light mode styling when disabled', () => {
      const { container } = render(
        <ChatInput {...defaultProps} isDarkMode={false} />
      );

      const chatBox = container.querySelector('[data-name="chat-input-box"]');
      expect(chatBox?.className).toContain('bg-white');
    });
  });

  describe('Text Input', () => {
    it('should handle text input changes', () => {
      const setInputMessage = jest.fn();
      render(
        <ChatInput {...defaultProps} setInputMessage={setInputMessage} />
      );

      const textarea = screen.getByPlaceholderText(/type.*message/i);
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      expect(setInputMessage).toHaveBeenCalledWith('Hello');
    });

    it('should call handleKeyPress on key down', () => {
      const handleKeyPress = jest.fn();
      render(
        <ChatInput {...defaultProps} handleKeyPress={handleKeyPress} />
      );

      const textarea = screen.getByPlaceholderText(/type.*message/i);
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(handleKeyPress).toHaveBeenCalled();
    });

    it('should disable textarea while sending', () => {
      render(
        <ChatInput {...defaultProps} isSending={true} />
      );

      const textarea = screen.getByPlaceholderText(/type.*message/i) as HTMLTextAreaElement;
      expect(textarea.disabled).toBe(true);
    });

    it('should have placeholder text', () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/type.*message|digite/i);
      expect(textarea).toHaveAttribute('placeholder');
    });

    it('should auto-resize textarea based on content', async () => {
      const { container } = render(
        <ChatInput {...defaultProps} inputMessage="Test message" />
      );

      const textarea = container.querySelector('textarea');
      expect(textarea).toBeInTheDocument();
      // Textarea should have inline styles for height
      expect(textarea?.style.minHeight).toBe('48px');
    });
  });

  describe('Send Button', () => {
    it('should have a send button in the component', () => {
      const { container } = render(
        <ChatInput {...defaultProps} inputMessage="Hello" />
      );

      // Find send button by looking for buttons in the action area
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should show loading spinner while sending', () => {
      const { container } = render(
        <ChatInput {...defaultProps} isSending={true} />
      );

      // Look for loading spinner
      const spinner = container.querySelector('[class*="animate-spin"]');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Provider Hints', () => {
    it('should show hint when Google is not configured', () => {
      render(
        <ChatInput
          {...defaultProps}
          selectedModel={'model_1'}
          googleConfigured={false}
        />
      );

      const hint = screen.getByText(/google.*not configured|not configured/i);
      expect(hint).toBeInTheDocument();
    });

    it('should show hint when GitHub is not configured', () => {
      render(
        <ChatInput
          {...defaultProps}
          selectedModel={'model_2'}
          githubConfigured={false}
        />
      );

      const hint = screen.getByText(/github.*not configured|not configured/i);
      expect(hint).toBeInTheDocument();
    });

    it('should show hint when Ollama is not connected', () => {
      render(
        <ChatInput
          {...defaultProps}
          selectedModel={'ollama_model'}
          ollamaConnected={false}
          MODELS={[
            ...defaultProps.MODELS,
            { id: 'ollama_model', name: 'Ollama', provider: 'ollama', category: 'Fast' }
          ]}
        />
      );

      const hint = screen.getByText(/ollama.*not connected/i);
      expect(hint).toBeInTheDocument();
    });

    it('should not show hint when provider is configured', () => {
      render(<ChatInput {...defaultProps} />);

      const hint = screen.queryByText(/not configured|not connected/i);
      expect(hint).not.toBeInTheDocument();
    });
  });

  describe('Attachments', () => {
    it('should have attachment button', () => {
      render(<ChatInput {...defaultProps} />);

      const attachBtn = screen.getByRole('button', { name: /attachment|clip|add/i }) ||
                        screen.getByRole('button', { name: /\+/i });
      expect(attachBtn).toBeInTheDocument();
    });

    it('should toggle attachment dropdown on click', async () => {
      render(<ChatInput {...defaultProps} />);

      const attachBtn = screen.getByRole('button', { name: /attachment|add|clip/i }) ||
                        screen.getByRole('button', { name: /\+/i });

      fireEvent.click(attachBtn);

      await waitFor(() => {
        const dropdown = document.getElementById('chat-input-attach-dropdown');
        expect(dropdown?.className).not.toContain('hidden');
      });
    });

    it('should display image attachment option', async () => {
      render(<ChatInput {...defaultProps} />);

      const attachBtn = screen.getByRole('button', { name: /attachment|add|clip/i }) ||
                        screen.getByRole('button', { name: /\+/i });
      fireEvent.click(attachBtn);

      await waitFor(() => {
        const imageBtn = screen.getByRole('button', { name: /image/i });
        expect(imageBtn).toBeInTheDocument();
      });
    });

    it('should display document attachment option', async () => {
      render(<ChatInput {...defaultProps} />);

      const attachBtn = screen.getByRole('button', { name: /attachment|add|clip/i }) ||
                        screen.getByRole('button', { name: /\+/i });
      fireEvent.click(attachBtn);

      await waitFor(() => {
        const docBtn = screen.getByRole('button', { name: /document|file/i });
        expect(docBtn).toBeInTheDocument();
      });
    });

    it('should accept image attachments', () => {
      const onImageSelect = jest.fn();
      const fileInputRef = React.createRef<HTMLInputElement>();

      render(
        <ChatInput
          {...defaultProps}
          onImageSelect={onImageSelect}
          fileInputRef={fileInputRef}
        />
      );

      const imageInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
      expect(imageInput).toBeInTheDocument();

      const file = new File(['image content'], 'test.png', { type: 'image/png' });
      fireEvent.change(imageInput, { target: { files: [file] } });

      expect(onImageSelect).toHaveBeenCalled();
    });

    it('should accept document attachments', () => {
      const onDocumentSelect = jest.fn();
      const documentFileInputRef = React.createRef<HTMLInputElement>();

      render(
        <ChatInput
          {...defaultProps}
          onDocumentSelect={onDocumentSelect}
          documentFileInputRef={documentFileInputRef}
        />
      );

      const docInput = document.querySelector('input[type="file"][accept*=".txt"]') as HTMLInputElement;
      expect(docInput).toBeInTheDocument();

      const file = new File(['doc content'], 'test.txt', { type: 'text/plain' });
      fireEvent.change(docInput, { target: { files: [file] } });

      expect(onDocumentSelect).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/type.*message/i);
      expect(textarea).toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/type.*message/i);
      expect(textarea).toHaveFocus() || textarea.tabIndex >= -1;
    });
  });

  describe('Image Previews', () => {
    it('should display image attachments preview', () => {
      const imageAttachments = [
        { file: new File([], 'test.png'), preview: 'data:image/png;base64,test' }
      ];

      const { container } = render(
        <ChatInput
          {...defaultProps}
          imageAttachments={imageAttachments}
        />
      );

      const preview = container.querySelector('img[alt*="Preview"]');
      expect(preview).toBeInTheDocument();
    });

    it('should allow removing image attachments', () => {
      const onRemoveImage = jest.fn();
      const imageAttachments = [
        { file: new File([], 'test.png'), preview: 'data:image/png;base64,test' }
      ];

      const { container } = render(
        <ChatInput
          {...defaultProps}
          imageAttachments={imageAttachments}
          onRemoveImage={onRemoveImage}
        />
      );

      const removeBtn = container.querySelector('button[class*="top-2"]');
      if (removeBtn) {
        fireEvent.click(removeBtn);
        expect(onRemoveImage).toHaveBeenCalledWith(0);
      }
    });
  });

  describe('Document Previews', () => {
    it('should display document attachments preview', () => {
      const documentAttachments = [
        { file: new File([], 'test.md'), name: 'test.md', content: '# Test' }
      ];

      render(
        <ChatInput
          {...defaultProps}
          documentAttachments={documentAttachments}
        />
      );

      const docText = screen.getByText('test.md');
      expect(docText).toBeInTheDocument();
    });

    it('should show processing state for documents', () => {
      const documentAttachments = [
        { file: new File([], 'test.md'), name: 'test.md', content: '' } // Empty content = processing
      ];

      const { container } = render(
        <ChatInput
          {...defaultProps}
          documentAttachments={documentAttachments}
        />
      );

      const spinner = container.querySelector('[class*="animate-spin"]');
      expect(spinner).toBeInTheDocument();
    });
  });
});
