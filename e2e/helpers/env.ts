export function getE2eCredentials(): { username: string; password: string } | null {
  const username = String(process.env.E2E_USER ?? '').trim();
  const password = String(process.env.E2E_PASSWORD ?? '').trim();
  if (!username || !password) {
    return null;
  }
  return { username, password };
}

export function requireE2eCredentials(): { username: string; password: string } {
  const credentials = getE2eCredentials();
  if (!credentials) {
    throw new Error('Set E2E_USER and E2E_PASSWORD (see e2e/.env.example)');
  }
  return credentials;
}
