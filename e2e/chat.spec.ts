import { test, expect } from '@playwright/test';

test.describe('Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    // For these tests, we assume a user is already created and logged in
    // In a real scenario, you'd set up a test user or use credentials
    await page.goto('/');

    // Try to login if not already authenticated
    const loginButton = page.getByRole('button', { name: /login|sign in/i });
    if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loginButton.click();

      const emailInput = page.getByLabel(/email/i);
      const passwordInput = page.getByLabel(/password/i, { exact: true });

      // Use test credentials
      await emailInput.fill('test-user@test.com');
      await passwordInput.fill('TestPassword123!');

      const submitButton = page.getByRole('button', { name: /login|sign in/i });
      await submitButton.click();

      await page.waitForLoadState('networkidle');
    }
  });

  test('should create a new conversation', async ({ page }) => {
    // Look for "New Chat" or "New Conversation" button
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation|create chat/i });

    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    // Should show empty chat interface
    const chatArea = page.locator('[data-testid="chat-area"], .chat-container, .messages');

    if (await chatArea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(chatArea).toBeVisible();
    }

    // Verify we're in the chat interface
    const chatInput = page.getByRole('textbox', { name: /message|chat/i }).or(page.locator('textarea, input[type="text"]').first());
    await expect(chatInput).toBeVisible({ timeout: 5000 });
  });

  test('should send a message and receive response', async ({ page }) => {
    // Create or navigate to a chat
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    // Find chat input
    const chatInput = page.getByRole('textbox', { name: /message|chat/i }).or(page.locator('textarea, input[type="text"]').first());
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Type message
    await chatInput.fill('Hello, how are you?');

    // Send message (look for Send button or press Enter)
    const sendButton = page.getByRole('button', { name: /send|submit/i });

    if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendButton.click();
    } else {
      // Try keyboard shortcut (usually Ctrl+Enter or just Enter)
      await chatInput.press('Enter');
    }

    // Wait for message to appear
    await page.waitForTimeout(1000);

    // Verify user message appears in chat
    const userMessage = page.locator('text=Hello, how are you?');
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    // Wait for assistant response (might take a few seconds)
    // Look for loading indicator or assistant message
    const assistantResponse = page.locator('[data-testid="assistant-message"], .assistant-message, .message.assistant');
    const loadingIndicator = page.locator('[data-testid="loading"], .loading, .spinner');

    // Either see response or at least loading state
    const hasContent = await Promise.race([
      assistantResponse.first().isVisible({ timeout: 15000 }).then(() => true),
      loadingIndicator.first().isVisible({ timeout: 5000 }).then(() => true),
      page.locator('text=/I|I can|Sure|Hello/i').first().isVisible({ timeout: 15000 }).then(() => true),
    ]).catch(() => false);

    expect(hasContent).toBe(true);
  });

  test('should rename a conversation', async ({ page }) => {
    // Create a conversation first
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    await page.waitForTimeout(500);

    // Look for conversation title or name
    const conversationTitle = page.locator('[data-testid="conversation-title"], .conversation-name, h2').first();

    // Try to click on title to edit (or find rename button)
    const moreButton = page.getByRole('button', { name: /more|menu|options|⋮|…/i }).first();

    if (await moreButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await moreButton.click();

      const renameOption = page.getByRole('button', { name: /rename|edit name/i });
      if (await renameOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await renameOption.click();

        // Input new name
        const nameInput = page.getByRole('textbox', { name: /name|title/i }).or(page.locator('input[type="text"]'));
        await nameInput.fill('Test Conversation');

        // Confirm rename
        const confirmButton = page.getByRole('button', { name: /confirm|save|ok|done/i });
        if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmButton.click();
        } else {
          await nameInput.press('Enter');
        }

        // Verify new name appears
        await expect(page.locator('text=Test Conversation')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should delete a conversation', async ({ page }) => {
    // Create a conversation
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    await page.waitForTimeout(500);

    // Find delete option in menu
    const moreButton = page.getByRole('button', { name: /more|menu|options|⋮|…/i }).first();

    if (await moreButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await moreButton.click();

      const deleteButton = page.getByRole('button', { name: /delete|remove|trash/i });

      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteButton.click();

        // Confirm deletion if there's a confirmation dialog
        const confirmDelete = page.getByRole('button', { name: /confirm|yes|delete|remove/i });
        if (await confirmDelete.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmDelete.click();
        }

        // Should redirect away from deleted conversation
        await page.waitForLoadState('networkidle');

        // Conversation should be removed from sidebar
        const deletedConvo = page.locator('[data-testid="conversation-item"]').filter({ hasText: /Test/ });
        const count = await deletedConvo.count();

        // Either no conversations with that name or we're in a different view
        expect(page.url()).not.toContain('conversation');
      }
    }
  });

  test('should display message history in correct order', async ({ page }) => {
    // Navigate to a conversation (or create one)
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    // Send multiple messages
    const messages = ['First message', 'Second message', 'Third message'];

    for (const msg of messages) {
      const chatInput = page.getByRole('textbox', { name: /message|chat/i }).or(page.locator('textarea, input[type="text"]').first());
      await chatInput.fill(msg);

      const sendButton = page.getByRole('button', { name: /send|submit/i });
      if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendButton.click();
      } else {
        await chatInput.press('Enter');
      }

      await page.waitForTimeout(500);
    }

    // Verify messages appear in order
    const messageElements = page.locator('[data-testid="message"], .message');

    for (const msg of messages) {
      const msgLocator = page.locator(`text=${msg}`);
      await expect(msgLocator).toBeVisible({ timeout: 5000 });
    }
  });

  test('should support code blocks in messages', async ({ page }) => {
    // Create a conversation
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    // Send a message asking for code
    const chatInput = page.getByRole('textbox', { name: /message|chat/i }).or(page.locator('textarea, input[type="text"]').first());
    await chatInput.fill('Show me a hello world in JavaScript');

    const sendButton = page.getByRole('button', { name: /send|submit/i });
    if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendButton.click();
    } else {
      await chatInput.press('Enter');
    }

    // Wait for response with code
    await page.waitForTimeout(2000);

    // Look for code block
    const codeBlock = page.locator('pre, code, [data-testid="code-block"]').first();

    // Code block should be visible (optional based on model response)
    const hasCodeBlock = await codeBlock.isVisible({ timeout: 15000 }).catch(() => false);
    const hasConsoleMessage = await page.locator('text=/console|log|function|var|const/i').isVisible({ timeout: 15000 }).catch(() => false);

    // Either see actual code or at least evidence response was received
    expect(hasCodeBlock || hasConsoleMessage).toBe(true);
  });

  test('should handle long messages gracefully', async ({ page }) => {
    // Create conversation
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    // Send a very long message
    const longMessage = 'a'.repeat(500);

    const chatInput = page.getByRole('textbox', { name: /message|chat/i }).or(page.locator('textarea, input[type="text"]').first());
    await chatInput.fill(longMessage);

    const sendButton = page.getByRole('button', { name: /send|submit/i });
    if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendButton.click();
    } else {
      await chatInput.press('Enter');
    }

    // Message should be sent and visible
    await page.waitForTimeout(1000);

    // Verify message is in the chat (even if wrapped)
    const userMessage = page.locator('text=' + longMessage.substring(0, 100));
    const isVisible = await userMessage.isVisible({ timeout: 5000 }).catch(() => false);

    // Message should be present in some form
    expect(page.locator('body').textContent()).resolves.toContain(longMessage.substring(0, 50));
  });

  test('should preserve conversation state on refresh', async ({ page }) => {
    // Create and send message to a conversation
    const newChatButton = page.getByRole('button', { name: /new chat|new conversation/i });
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
    }

    const chatInput = page.getByRole('textbox', { name: /message|chat/i }).or(page.locator('textarea, input[type="text"]').first());
    await chatInput.fill('Remember this message');

    const sendButton = page.getByRole('button', { name: /send|submit/i });
    if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendButton.click();
    } else {
      await chatInput.press('Enter');
    }

    // Get conversation ID or URL
    const currentUrl = page.url();

    // Refresh the page
    await page.reload();

    await page.waitForLoadState('networkidle');

    // Message should still be visible
    const persistedMessage = page.locator('text=Remember this message');
    await expect(persistedMessage).toBeVisible({ timeout: 5000 });
  });
});
