import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';

function loadE2eEnvFile(): void {
  const envPath = resolve(__dirname, '../../../e2e/.env');
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator < 1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadE2eEnvFile();

export const API_BASE_URL = (
  process.env.E2E_API_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

export const E2E_USER = String(process.env.E2E_USER ?? '').trim();
export const E2E_PASSWORD = String(process.env.E2E_PASSWORD ?? '').trim();
export const HAS_E2E_CREDENTIALS = Boolean(E2E_USER && E2E_PASSWORD);

export function api() {
  return request(API_BASE_URL);
}

export async function isApiReachable(): Promise<boolean> {
  try {
    const response = await api().get('/health');
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function waitForApi(attempts = 10, delayMs = 500): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isApiReachable()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

export async function loginAsE2eUser(): Promise<string> {
  const response = await api().post('/login').send({
    username: E2E_USER,
    password: E2E_PASSWORD,
  });

  expect(response.status).toBe(200);
  expect(response.body?.success).toBe(true);
  expect(typeof response.body?.accessToken).toBe('string');

  return String(response.body.accessToken);
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
