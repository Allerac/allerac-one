import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page before each test
    await page.goto('/');
  });

  test('should register a new user and see onboarding', async ({ page }) => {
    // Click on register tab or modal
    const registerButton = page.getByRole('button', { name: /register/i });
    await registerButton.click();

    // Fill in registration form
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i, { exact: true });

    await emailInput.fill(`test-${Date.now()}@test.com`);
    await passwordInput.fill('TestPassword123!');

    // Submit registration
    const submitButton = page.getByRole('button', { name: /register|sign up/i });
    await submitButton.click();

    // Should redirect to onboarding
    await page.waitForURL(/onboarding/);
    expect(page.url()).toContain('onboarding');

    // Verify onboarding wizard is visible
    const wizardTitle = page.getByRole('heading');
    await expect(wizardTitle).toBeVisible();
  });

  test('should login with existing credentials', async ({ page }) => {
    // Open login modal/page
    const loginButton = page.getByRole('button', { name: /login|sign in/i });
    await loginButton.click();

    // Fill login form
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i, { exact: true });

    // Use a test account - in real scenario this would be created in beforeEach
    await emailInput.fill('test-user@test.com');
    await passwordInput.fill('TestPassword123!');

    // Submit login
    const submitButton = page.getByRole('button', { name: /login|sign in/i });
    await submitButton.click();

    // Should redirect to hub (not onboarding since user completed it)
    // Wait for navigation to complete
    await page.waitForLoadState('networkidle');

    // Verify we're in the main app (look for hub or chat interface)
    const pageTitle = page.locator('h1, h2');
    await expect(pageTitle).toBeVisible({ timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    const loginButton = page.getByRole('button', { name: /login|sign in/i });
    await loginButton.click();

    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i, { exact: true });

    await emailInput.fill('test-user@test.com');
    await passwordInput.fill('TestPassword123!');

    const submitButton = page.getByRole('button', { name: /login|sign in/i });
    await submitButton.click();

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Find logout button (typically in user menu)
    const userMenu = page.getByRole('button', { name: /menu|profile|user|settings/i }).first();
    if (await userMenu.isVisible()) {
      await userMenu.click();
    }

    const logoutButton = page.getByRole('button', { name: /logout|sign out|exit/i });
    await logoutButton.click();

    // Should redirect to login or home page
    await page.waitForURL(/login|\/$/);
    expect([page.url().includes('login'), page.url().endsWith('/')]).toContain(true);
  });

  test('should handle invalid credentials gracefully', async ({ page }) => {
    // Open login modal
    const loginButton = page.getByRole('button', { name: /login|sign in/i });
    await loginButton.click();

    // Fill with wrong credentials
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i, { exact: true });

    await emailInput.fill('nonexistent@test.com');
    await passwordInput.fill('WrongPassword123!');

    // Submit login
    const submitButton = page.getByRole('button', { name: /login|sign in/i });
    await submitButton.click();

    // Should show error message
    const errorMessage = page.getByRole('alert').or(page.locator('text=/invalid|error|incorrect/i'));
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Should still be on login page
    expect(page.url()).not.toContain('hub');
    expect(page.url()).not.toContain('onboarding');
  });

  test('should validate email format', async ({ page }) => {
    // Open register
    const registerButton = page.getByRole('button', { name: /register/i });
    await registerButton.click();

    // Try to register with invalid email
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i, { exact: true });

    await emailInput.fill('not-an-email');
    await passwordInput.fill('TestPassword123!');

    // Submit should fail or show validation error
    const submitButton = page.getByRole('button', { name: /register|sign up/i });
    await submitButton.click();

    // Should show validation error or still be on registration page
    await page.waitForTimeout(500); // Give validation time to process
    const isStillRegistering = page.url().includes('register') ||
                               page.url() === '/' ||
                               await page.getByRole('alert').isVisible().catch(() => false);

    expect(isStillRegistering).toBe(true);
  });

  test('should validate password strength', async ({ page }) => {
    // Open register
    const registerButton = page.getByRole('button', { name: /register/i });
    await registerButton.click();

    // Try to register with weak password
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i, { exact: true });

    await emailInput.fill(`weak-${Date.now()}@test.com`);
    await passwordInput.fill('123'); // Too weak

    // Try to submit
    const submitButton = page.getByRole('button', { name: /register|sign up/i });

    // Button might be disabled or form might show error
    const isDisabled = await submitButton.isDisabled();
    await submitButton.click();

    await page.waitForTimeout(500);

    // Should either show error or button should be disabled
    const errorVisible = await page.getByRole('alert').isVisible().catch(() => false);
    expect(isDisabled || errorVisible).toBe(true);
  });

  test('should prevent duplicate email registration', async ({ page }) => {
    const testEmail = `duplicate-${Date.now()}@test.com`;

    // First registration
    let registerButton = page.getByRole('button', { name: /register/i });
    await registerButton.click();

    let emailInput = page.getByLabel(/email/i);
    let passwordInput = page.getByLabel(/password/i, { exact: true });

    await emailInput.fill(testEmail);
    await passwordInput.fill('TestPassword123!');

    let submitButton = page.getByRole('button', { name: /register|sign up/i });
    await submitButton.click();

    // Wait for first registration to complete
    await page.waitForLoadState('networkidle');

    // Navigate back to home
    await page.goto('/');

    // Try to register again with same email
    registerButton = page.getByRole('button', { name: /register/i });
    await registerButton.click();

    emailInput = page.getByLabel(/email/i);
    passwordInput = page.getByLabel(/password/i, { exact: true });

    await emailInput.fill(testEmail);
    await passwordInput.fill('AnotherPassword123!');

    submitButton = page.getByRole('button', { name: /register|sign up/i });
    await submitButton.click();

    // Should show error about duplicate email
    const errorMessage = page.getByRole('alert').or(page.locator('text=/already exists|duplicate|already registered/i'));
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });
});
