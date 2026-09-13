import { expect, test } from '@playwright/test';
import { openModuleOrSkip } from '../helpers/auth';

const modules: Array<{ path: string; title: string }> = [
  { path: '/users/dashboard', title: '' },
  { path: '/users/sales-order', title: 'Sales Order' },
  { path: '/users/sales-order-materials', title: 'Material Sales Order' },
  { path: '/users/purchase-order', title: 'Purchase Order' },
  { path: '/users/purchase-order-materials', title: 'PO Materials (ACM)' },
  { path: '/users/quotation', title: 'Quotation' },
  { path: '/users/inventory', title: 'Material Inventory' },
  { path: '/users/customers', title: 'Stakeholders' },
  { path: '/users/accounting', title: 'Accounting' },
  { path: '/users/payroll', title: 'Payroll' },
  { path: '/users/user-management', title: 'User Management' },
  { path: '/users/settings', title: 'Settings' },
  { path: '/users/profile', title: 'Profile' },
];

test.describe('Module smokes', () => {
  test('dashboard stays authenticated', async ({ page }) => {
    await page.goto('/users/dashboard');
    await expect(page).toHaveURL(/\/users\//);
    await expect(page.locator('input[name="username"]')).toHaveCount(0);
    const dashboardHeading = page.getByRole('heading', {
      name: 'Warehouse + Sales Hybrid Dashboard',
    });
    if ((await dashboardHeading.count()) > 0) {
      await expect(dashboardHeading).toBeVisible();
    }
  });

  for (const module of modules.filter((item) => item.title)) {
    test(`opens ${module.title}`, async ({ page }) => {
      const opened = await openModuleOrSkip(page, module.path, module.title);
      test.skip(!opened, `No access to ${module.title} (RBAC redirected)`);
      await expect(page).toHaveURL(new RegExp(module.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }
});
