import type { APIRequestContext } from '@playwright/test';

export function getApiBaseUrl(): string {
  return (process.env.E2E_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export async function waitForApi(
  request: APIRequestContext,
  attempts = 20,
  delayMs = 500,
): Promise<void> {
  const healthUrl = `${getApiBaseUrl()}/health`;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request.get(healthUrl);
      if (response.ok()) {
        return;
      }
    } catch {
      // Backend may still be compiling.
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`API is not reachable at ${healthUrl}. Start the backend with npm run start:dev.`);
}
