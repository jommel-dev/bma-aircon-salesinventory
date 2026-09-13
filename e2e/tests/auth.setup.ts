import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loginThroughUi } from '../helpers/auth';
import { getE2eCredentials } from '../helpers/env';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  setup.skip(!getE2eCredentials(), 'Set E2E_USER and E2E_PASSWORD in e2e/.env');
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await loginThroughUi(page);
  await page.waitForFunction(() => Boolean(localStorage.getItem('accessToken')));
  await page.context().storageState({ path: authFile });
});
