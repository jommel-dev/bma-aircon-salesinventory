import { expect, test } from '@playwright/test';
import { openModuleOrSkip } from '../helpers/auth';

test.describe('Inventory', () => {
  test('material inventory tree and table load', async ({ page }) => {
    const opened = await openModuleOrSkip(page, '/users/inventory', 'Material Inventory');
    test.skip(!opened, 'No access to Inventory');

    await expect(page.getByText('Product Types & Brands')).toBeVisible();
    await expect(page.getByRole('button', { name: /create type\/products/i })).toBeVisible();
  });
});
