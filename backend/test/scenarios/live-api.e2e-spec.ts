import {
  API_BASE_URL,
  HAS_E2E_CREDENTIALS,
  api,
  authHeader,
  loginAsE2eUser,
  waitForApi,
} from './live-api.helpers';

const describeAuth = HAS_E2E_CREDENTIALS ? describe : describe.skip;

/**
 * Hits the running Nest API (default http://localhost:3000).
 * Authenticated list checks skip unless E2E_USER and E2E_PASSWORD are set.
 * These are read-only smokes so a local/dev database is not mutated.
 */
describe('Live API scenarios', () => {
  beforeAll(async () => {
    const ready = await waitForApi();
    if (!ready) {
      throw new Error(
        `API is not reachable at ${API_BASE_URL}. Start the backend with npm run start:dev.`,
      );
    }
  });

  it('GET /health reports ok', async () => {
    const response = await api().get('/health');
    expect(response.status).toBe(200);
    expect(response.body?.status).toBe('ok');
  });

  it('rejects a protected list without a token', async () => {
    const response = await api().get('/sales-order/materials');
    expect(response.status).toBe(401);
  });

  it('rejects invalid login credentials', async () => {
    const response = await api().post('/login').send({
      username: 'e2e-invalid-user',
      password: 'wrong-password',
    });

    expect(response.status).toBe(200);
    expect(response.body?.success).toBe(false);
    expect(String(response.body?.message ?? '')).toMatch(/invalid/i);
  });

  describeAuth('authenticated module lists', () => {
    let accessToken = '';

    beforeAll(async () => {
      accessToken = await loginAsE2eUser();
    });

    it('logs in with E2E credentials', () => {
      expect(accessToken.length).toBeGreaterThan(20);
    });

    it.each([
      ['material sales orders', '/sales-order/materials?status=pending&page=1&limit=10'],
      ['legacy sales orders', '/sales-order?page=1&limit=10'],
      ['customers', '/sales-order/customers?page=1&limit=10'],
      ['quotations', '/quotation?page=1&limit=10'],
      ['purchase orders', '/purchase?page=1&limit=10'],
      ['purchase deliveries', '/purchase/deliveries?page=1&limit=10'],
      ['materials', '/inventory/materials'],
      ['pending backorders', '/backorders/pending?limit=20&offset=0'],
      ['dashboard overview', '/dashboard/overview'],
      ['users', '/users'],
      ['roles', '/users/roles'],
      ['payroll employees', '/payroll/employees'],
      ['account titles', '/accounting/account-titles'],
      ['cheque vouchers', '/accounting/cheque-vouchers'],
    ])('lists %s', async (_label, path) => {
      const response = await api().get(path).set(authHeader(accessToken));
      expect(response.status).toBeLessThan(500);
      expect([200, 403]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toBeDefined();
      }
    });

    it('stock-check with no items returns an empty list', async () => {
      const response = await api()
        .post('/sales-order/materials/stock-check')
        .set(authHeader(accessToken))
        .send({ items: [] });

      expect([200, 201]).toContain(response.status);
      expect(Array.isArray(response.body?.items)).toBe(true);
      expect(response.body.items).toHaveLength(0);
    });

    it('material search requires a query', async () => {
      const response = await api()
        .get('/inventory/materials/search')
        .set(authHeader(accessToken));

      expect(response.status).toBe(400);
    });
  });
});
