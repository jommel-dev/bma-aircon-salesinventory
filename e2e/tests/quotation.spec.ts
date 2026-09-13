import { expect, test } from '@playwright/test';
import { openModuleOrSkip } from '../helpers/auth';

test.describe('Quotation', () => {
  test('list page loads with create action', async ({ page }) => {
    const opened = await openModuleOrSkip(page, '/users/quotation', 'Quotation');
    test.skip(!opened, 'No access to Quotation');

    await expect(page.getByRole('heading', { name: 'Quotation List' })).toBeVisible();
  });

  test('create form opens without submitting', async ({ page }) => {
    const opened = await openModuleOrSkip(page, '/users/quotation', 'Quotation');
    test.skip(!opened, 'No access to Quotation');

    await page.goto('/users/quotation/create');
    await expect(page.getByRole('heading', { name: 'Create Quotation' }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
