import { expect, type Page } from '@playwright/test';
import { requireE2eCredentials } from './env';

export async function loginThroughUi(page: Page): Promise<void> {
  const { username, password } = requireE2eCredentials();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByText('Keep me logged in').click();
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/users\//, { timeout: 20_000 });
}

export async function expectPageTitle(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
}

export async function openModuleOrSkip(
  page: Page,
  path: string,
  title: string,
): Promise<boolean> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');

  const heading = page.getByRole('heading', { name: title });
  if ((await heading.count()) === 0) {
    return false;
  }

  await expect(heading.first()).toBeVisible();
  return true;
}
