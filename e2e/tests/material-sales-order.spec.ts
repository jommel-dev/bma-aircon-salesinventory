import { expect, test } from '@playwright/test';
import { openModuleOrSkip } from '../helpers/auth';

test.describe('Material sales order', () => {
  test('list page shows pending tab and search', async ({ page }) => {
    const opened = await openModuleOrSkip(
      page,
      '/users/sales-order-materials',
      'Material Sales Order',
    );
    test.skip(!opened, 'No access to Material Sales Order');

    await expect(page.getByRole('button', { name: /pending/i }).first()).toBeVisible();
    await expect(
      page.getByPlaceholder('Search by order number or customer...'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ new order/i })).toBeVisible();
  });

  test('create form opens without submitting', async ({ page }) => {
    const opened = await openModuleOrSkip(
      page,
      '/users/sales-order-materials',
      'Material Sales Order',
    );
    test.skip(!opened, 'No access to Material Sales Order');

    await page.goto('/users/sales-order-materials/create');
    await expect(page.getByRole('heading', { name: 'Create Sales Order' }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
