import { expect, test } from '@playwright/test';
import { waitForApi } from '../helpers/api';
import { loginThroughUi } from '../helpers/auth';
import { getE2eCredentials } from '../helpers/env';

test.describe('Login', () => {
  test.beforeEach(async ({ request }) => {
    await waitForApi(request);
  });

  test('shows the login form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('keeps the user on login after invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[name="username"]').fill('e2e-invalid-user');
    await page.locator('input[name="password"]').fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid username or password/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/$/);
  });

  test('signs in with valid credentials', async ({ page }) => {
    test.skip(!getE2eCredentials(), 'Set E2E_USER and E2E_PASSWORD in e2e/.env');
    await loginThroughUi(page);
    await expect(page).toHaveURL(/\/users\//);
  });
});
