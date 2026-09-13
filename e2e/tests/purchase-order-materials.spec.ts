import { expect, test } from '@playwright/test';
import { openModuleOrSkip } from '../helpers/auth';

test.describe('PO materials (ACM)', () => {
  test('list page loads', async ({ page }) => {
    const opened = await openModuleOrSkip(
      page,
      '/users/purchase-order-materials',
      'PO Materials (ACM)',
    );
    test.skip(!opened, 'No access to PO Materials');
    await expect(page.getByTestId('page-title')).toHaveText('PO Materials (ACM)');
  });

  test('create form opens without submitting', async ({ page }) => {
    const opened = await openModuleOrSkip(
      page,
      '/users/purchase-order-materials',
      'PO Materials (ACM)',
    );
    test.skip(!opened, 'No access to PO Materials');

    await page.goto('/users/purchase-order-materials/new');
    await expect(page.getByRole('heading', { name: 'Create Purchase Order' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('ACM (Aircon Materials)')).toBeVisible();
  });
});
