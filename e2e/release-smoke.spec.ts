import { expect, test } from '@playwright/test';

test.describe('release candidate smoke', () => {
  test('serves the login page', async ({ page }) => {
    const response = await page.goto('/login');

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/allerac/i);
    await expect(page.locator('body')).toContainText(/allerac/i);
  });

  test('serves the Control API auth envelope', async ({ request }) => {
    const response = await request.get('/api/v1/me');

    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
    await expect(await response.json()).toEqual({
      error: {
        code: 'unauthorized',
        message: 'Unauthorized',
      },
    });
  });
});
