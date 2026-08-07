import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PoolClient } from 'pg';
import { AuditActorContext, AuditLogService } from 'src/audit-log/audit-log.service';

type Trend = 'up' | 'down';

type KpiCard = {
  label: string;
  value: string;
  change: string;
  trend: Trend;
};

type OpsLevel = 'normal' | 'warning' | 'critical';

type OpsItem = {
  label: string;
  value: string;
  hint: string;
  level: OpsLevel;
};

type ActivityItem = {
  time: string;
  text: string;
  status: 'received' | 'dispatch' | 'install' | 'payment';
};

type DashboardResponse = {
  success: boolean;
  message?: string;
  item?: {
    generatedAt: string;
    topKpis: KpiCard[];
    operations: OpsItem[];
    salesSummary: KpiCard[];
    topCustomers: Array<{ rank: number; name: string; totalAmount: number; orderCount: number }>;
    topSuppliers: Array<{ rank: number; name: string; totalAmount: number; poCount: number }>;
    topEmployees: Array<{ rank: number; name: string; totalSales: number; orderCount: number }>;
    netoData: { gross: number; discounts: number; returns: number; neto: number; outstanding: number };
    activityFeed: ActivityItem[];
    todayFocus: string;
  };
};

type CountRow = { count: string };
type ActivityRow = { eventAt: string | null; text: string; status: 'received' | 'dispatch' | 'install' | 'payment' };
type SalesFinancialSummaryRow = {
  settledAmount: string;
  settledCount: string;
  unpaidAmount: string;
  unpaidCount: string;
  overdueAmount: string;
  overdueCount: string;
  chequeAmount: string;
  chequeCount: string;
};
type DashboardSalesDetailMode = 'sales' | 'unpaid' | 'overdues' | 'cheques';
type DashboardOperationDetailMode = 'purchase-orders' | 'credit-terms' | 'paid-purchases' | 'stock-alerts';
type DashboardSettlementMode = 'partial' | 'full' | 'cheque' | 'split';
type DashboardReceivableVerificationMode = 'cheque' | 'credit-card';
type SalesSettlementStateRow = {
  soId: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  outstandingReceivableAmount: string;
  normalizedStatus: string;
  branchId: string | null;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async getSalesSettlementAuditSnapshot(
    salesOrderId: number,
    branchId?: number,
  ): Promise<Record<string, unknown> | null> {
    const branchParam = branchId ? String(branchId) : null;
    const result = await this.databaseService.query<SalesSettlementStateRow>(
      `${this.getSalesDashboardBaseCte()}
       SELECT
         ss.so_id::text AS "soId",
         ss.total_amount::text AS "totalAmount",
         ss.paid_amount::text AS "paidAmount",
         ss.remaining_amount::text AS "remainingAmount",
         ss.outstanding_receivable_amount::text AS "outstandingReceivableAmount",
         ss.normalized_status::text AS "normalizedStatus",
         NULLIF(ss.branch_id, '')::text AS "branchId"
       FROM sales_scope ss
       WHERE ss.so_id = $1::text
         AND ($2::text IS NULL OR ss.branch_id = $2::text)
       LIMIT 1`,
      [String(salesOrderId), branchParam],
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      salesOrderId: Number(row.soId),
      totalAmount: this.toNumber(row.totalAmount),
      paidAmount: this.toNumber(row.paidAmount),
      remainingAmount: this.toNumber(row.remainingAmount),
      outstandingReceivableAmount: this.toNumber(row.outstandingReceivableAmount),
      normalizedStatus: row.normalizedStatus,
      branchId: row.branchId ? Number(row.branchId) : null,
    };
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatInteger(value: number): string {
    return Math.round(value).toLocaleString('en-PH');
  }

  private formatCurrency(value: number): string {
    return `PHP ${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
  }

  private formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  private buildDelta(current: number, previous: number): { change: string; trend: Trend } {
    const safePrevious = previous === 0 ? current || 1 : previous;
    const diff = ((current - safePrevious) / safePrevious) * 100;
    const trend: Trend = diff >= 0 ? 'up' : 'down';
    const sign = diff >= 0 ? '+' : '';
    return {
      change: `${sign}${diff.toFixed(1)}%`,
      trend,
    };
  }

  private normalizeStatus(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
  }

  private formatActivityTime(value: string | null): string {
    if (!value) {
      return '--:--';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '--:--';
    }

    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private async getTableColumns(client: PoolClient, tableName: string): Promise<string[]> {
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1`,
      [tableName],
    );

    return result.rows.map((row) => row.column_name);
  }

  private pickColumn(columns: string[], candidates: string[]): string | null {
    for (const candidate of candidates) {
      if (columns.includes(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private toIsoDateOrNull(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private async loadSalesSettlementState(
    client: PoolClient,
    salesOrderId: number,
    branchId?: number,
  ): Promise<SalesSettlementStateRow> {
    const branchParam = branchId ? String(branchId) : null;
    const result = await client.query<SalesSettlementStateRow>(
      `${this.getSalesDashboardBaseCte()}
       SELECT
         ss.so_id::text AS "soId",
         ss.total_amount::text AS "totalAmount",
         ss.paid_amount::text AS "paidAmount",
         ss.remaining_amount::text AS "remainingAmount",
         ss.outstanding_receivable_amount::text AS "outstandingReceivableAmount",
         ss.normalized_status::text AS "normalizedStatus",
         NULLIF(ss.branch_id, '')::text AS "branchId"
       FROM sales_scope ss
       WHERE ss.so_id = $1::text
         AND ($2::text IS NULL OR ss.branch_id = $2::text)
       LIMIT 1`,
      [String(salesOrderId), branchParam],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Sales order not found for settlement');
    }

    return result.rows[0];
  }

  private async insertSalesPaymentRecord(
    client: PoolClient,
    salesOrderId: number,
    payload: {
      method: string;
      amount: number;
      status: string;
      paymentDate?: string | null;
      referenceNo?: string | null;
      checkNo?: string | null;
      bankName?: string | null;
      bankAccount?: string | null;
      postDated?: string | null;
      termsDueDate?: string | null;
    },
  ): Promise<void> {
    // Check if this is a material sales order (salesType = 'sales')
    const soTypeResult = await client.query<{ salesType: string }>(
      `SELECT COALESCE(to_jsonb(so)->>'salesType', '') AS "salesType" FROM tblsales_order so WHERE so.id = $1 LIMIT 1`,
      [salesOrderId],
    );
    const salesType = (soTypeResult.rows[0]?.salesType ?? '').toLowerCase();
    const isMaterialOrder = salesType === 'sales';

    if (isMaterialOrder) {
      // Write to tblsales_order_payments (new payment table for material orders)
      await client.query(
        `INSERT INTO tblsales_order_payments
          (sales_order_id, method, amount, status, payment_date, reference_no, check_no, bank_name, bank_account, post_dated, terms_due_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          salesOrderId,
          payload.method,
          payload.amount,
          payload.status,
          payload.paymentDate || null,
          payload.referenceNo || null,
          payload.checkNo || null,
          payload.bankName || null,
          payload.bankAccount || null,
          payload.postDated || null,
          payload.termsDueDate || null,
        ],
      );
    } else {
      // Write to tblso_payments (legacy payment table for ACU orders)
      const paymentColumns = await this.getTableColumns(client, 'tblso_payments');
      const soIdColumn = this.pickColumn(paymentColumns, ['so_id', 'soId']);
      const methodColumn = this.pickColumn(paymentColumns, ['method']);
      const amountColumn = this.pickColumn(paymentColumns, ['amount']);
      const statusColumn = this.pickColumn(paymentColumns, ['status']);
      const paymentDateColumn = this.pickColumn(paymentColumns, ['payment_date', 'paymentDate']);
      const referenceNoColumn = this.pickColumn(paymentColumns, ['reference_no', 'referenceNo']);
      const checkNoColumn = this.pickColumn(paymentColumns, ['check_no', 'checkNo']);
      const bankNameColumn = this.pickColumn(paymentColumns, ['bank_name', 'bankName']);
      const bankAccountColumn = this.pickColumn(paymentColumns, ['bank_account', 'bankAccount']);
      const postDatedColumn = this.pickColumn(paymentColumns, ['post_dated', 'postDated']);
      const termsDueDateColumn = this.pickColumn(paymentColumns, ['terms_due_date', 'termsDueDate']);

      if (!soIdColumn || !methodColumn || !amountColumn || !statusColumn) {
        throw new BadRequestException('Sales payment columns are not configured as expected');
      }

      const record: Record<string, unknown> = {
        [soIdColumn]: salesOrderId,
        [methodColumn]: payload.method,
        [amountColumn]: payload.amount,
        [statusColumn]: payload.status,
      };

      if (paymentDateColumn) record[paymentDateColumn] = payload.paymentDate ?? null;
      if (referenceNoColumn && payload.referenceNo !== undefined) record[referenceNoColumn] = payload.referenceNo;
      if (checkNoColumn && payload.checkNo !== undefined) record[checkNoColumn] = payload.checkNo;
      if (bankNameColumn && payload.bankName !== undefined) record[bankNameColumn] = payload.bankName;
      if (bankAccountColumn && payload.bankAccount !== undefined) record[bankAccountColumn] = payload.bankAccount;
      if (postDatedColumn && payload.postDated !== undefined) record[postDatedColumn] = payload.postDated;
      if (termsDueDateColumn && payload.termsDueDate !== undefined) record[termsDueDateColumn] = payload.termsDueDate;

      const columns = Object.keys(record);
      const values = Object.values(record);
      const placeholders = values.map((_, index) => `$${index + 1}`);

      await client.query(
        `INSERT INTO tblso_payments (${columns.map((column) => `"${column}"`).join(', ')})
         VALUES (${placeholders.join(', ')})`,
        values,
      );
    }
  }

  private async updateSalesOrderStatusForSettlement(client: PoolClient, salesOrderId: number, branchId?: number): Promise<void> {
    const state = await this.loadSalesSettlementState(client, salesOrderId, branchId);
    const currentStatus = this.normalizeStatus(state.normalizedStatus);
    if (['complete', 'completed', 'cancelled', 'rejected', 'void'].includes(currentStatus)) {
      return;
    }

    const paidAmount = this.toNumber(state.paidAmount);
    const remainingAmount = this.toNumber(state.remainingAmount);
    const outstandingReceivableAmount = this.toNumber(state.outstandingReceivableAmount);
    const totalAmount = this.toNumber(state.totalAmount);
    let nextStatus = currentStatus || 'pending';

    if (Math.max(totalAmount - paidAmount, 0) <= 0) {
      // Fully collected (including verified cheque/credit-card) → complete the SO
      nextStatus = 'complete';
    } else if (currentStatus === 'remitted') {
      // Still has outstanding receivables; keep remitted
      return;
    } else if (paidAmount > 0 || outstandingReceivableAmount > 0 || remainingAmount < totalAmount) {
      nextStatus = 'partial';
    }

    if (nextStatus === currentStatus) {
      return;
    }

    const salesOrderColumns = await this.getTableColumns(client, 'tblsales_order');
    const statusColumn = this.pickColumn(salesOrderColumns, ['status']);
    if (!statusColumn) {
      throw new BadRequestException('Sales order status column is not configured as expected');
    }

    await client.query(
      `UPDATE tblsales_order
       SET "${statusColumn}" = $1
       WHERE id = $2`,
      [nextStatus, salesOrderId],
    );
  }

  private getSalesDashboardBaseCte(): string {
    return `WITH payment_scope AS (
      SELECT
        COALESCE(to_jsonb(sp)->>'so_id', to_jsonb(sp)->>'soId') AS so_id,
        CASE
          WHEN COALESCE(to_jsonb(sp)->>'amount', '0') ~ '^-?\\d+(\\.\\d+)?$'
            THEN COALESCE(to_jsonb(sp)->>'amount', '0')::numeric
          ELSE 0
        END AS amount,
        REPLACE(REPLACE(LOWER(TRIM(COALESCE(to_jsonb(sp)->>'method', ''))), '_', '-'), ' ', '-') AS normalized_method,
        REPLACE(REPLACE(LOWER(TRIM(COALESCE(to_jsonb(sp)->>'status', ''))), '_', '-'), ' ', '-') AS normalized_status,
        CASE
          WHEN REPLACE(REPLACE(LOWER(TRIM(COALESCE(to_jsonb(sp)->>'method', ''))), '_', '-'), ' ', '-') = 'cheque'
            THEN COALESCE(
              NULLIF(to_jsonb(sp)->>'post_dated', ''),
              NULLIF(to_jsonb(sp)->>'postDated', '')
            )::timestamptz
          ELSE COALESCE(
            NULLIF(to_jsonb(sp)->>'terms_due_date', ''),
            NULLIF(to_jsonb(sp)->>'termsDueDate', '')
          )::timestamptz
        END AS due_date
      FROM tblso_payments sp
      UNION ALL
      SELECT
        sop.sales_order_id::text AS so_id,
        COALESCE(sop.amount, 0) AS amount,
        REPLACE(REPLACE(LOWER(TRIM(COALESCE(sop.method, ''))), '_', '-'), ' ', '-') AS normalized_method,
        REPLACE(REPLACE(LOWER(TRIM(COALESCE(sop.status, ''))), '_', '-'), ' ', '-') AS normalized_status,
        CASE
          WHEN REPLACE(REPLACE(LOWER(TRIM(COALESCE(sop.method, ''))), '_', '-'), ' ', '-') = 'cheque'
            THEN sop.post_dated::timestamptz
          ELSE sop.terms_due_date::timestamptz
        END AS due_date
      FROM tblsales_order_payments sop
    ),
    payment_totals AS (
      SELECT
        ps.so_id,
        COALESCE(SUM(ps.amount) FILTER (
          WHERE COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid') IN ('paid', 'posted', 'cleared', 'complete', 'completed', 'remitted')
        ), 0) AS paid_amount,
        COALESCE(SUM(ps.amount) FILTER (
          WHERE ps.normalized_method IN ('cheque', 'credit-card')
            AND COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid') NOT IN ('paid', 'posted', 'cleared', 'complete', 'completed', 'remitted')
        ), 0) AS outstanding_receivable_amount,
        COUNT(*) FILTER (
          WHERE ps.normalized_method IN ('cheque', 'credit-card')
            AND ps.amount > 0
            AND COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid') NOT IN ('paid', 'posted', 'cleared', 'complete', 'completed', 'remitted')
        )::int AS outstanding_receivable_count,
        MIN(ps.due_date) FILTER (
          WHERE COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid') NOT IN ('paid', 'posted', 'cleared', 'complete', 'completed', 'remitted')
            AND ps.due_date IS NOT NULL
        ) AS next_due_date,
        COALESCE(
          STRING_AGG(
            DISTINCT ps.normalized_method,
            ', ' ORDER BY ps.normalized_method
          ),
          'Unknown'
        ) AS payment_methods,
        COALESCE(
          STRING_AGG(
            DISTINCT CASE
              WHEN ps.normalized_method = 'terms-with-dp' THEN 'Terms with DP'
              WHEN ps.normalized_method = 'installment' THEN 'Installment'
              WHEN ps.normalized_method = 'terms' THEN 'Terms'
              ELSE NULL
            END,
            ', '
          ) FILTER (
            WHERE ps.normalized_method IN ('terms', 'terms-with-dp', 'installment')
          ),
          '-'
        ) AS credit_terms_methods,
        COALESCE(
          STRING_AGG(
            DISTINCT CASE
              WHEN ps.normalized_method = 'credit-card' THEN 'Credit Card'
              WHEN ps.normalized_method = 'cheque' THEN 'Cheque'
              ELSE NULL
            END,
            ', '
          ) FILTER (
            WHERE ps.normalized_method IN ('cheque', 'credit-card')
              AND COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid') NOT IN ('paid', 'posted', 'cleared', 'complete', 'completed', 'remitted')
          ),
          'Unknown'
        ) AS outstanding_payment_methods
      FROM payment_scope ps
      WHERE COALESCE(ps.so_id, '') <> ''
      GROUP BY ps.so_id
    ),
    sales_scope AS (
      SELECT
        so.id::text AS so_id,
        COALESCE(to_jsonb(so)->>'so_number', to_jsonb(so)->>'soNumber', CONCAT('#', so.id::text)) AS so_number,
        COALESCE(to_jsonb(c)->>'name', 'Unknown Customer') AS customer,
        CASE
          WHEN COALESCE(to_jsonb(so)->>'total_amount', to_jsonb(so)->>'totalAmount', '0') ~ '^-?\\d+(\\.\\d+)?$'
            THEN COALESCE(to_jsonb(so)->>'total_amount', to_jsonb(so)->>'totalAmount', '0')::numeric
          ELSE 0
        END AS total_amount,
        REPLACE(REPLACE(LOWER(TRIM(COALESCE(to_jsonb(so)->>'status', COALESCE(so.status, 'pending')))), '_', '-'), ' ', '-') AS normalized_status,
        COALESCE(NULLIF(to_jsonb(so)->>'created_at', ''), NULLIF(to_jsonb(so)->>'createdAt', ''))::timestamptz AS created_at,
        COALESCE(
          COALESCE(NULLIF(to_jsonb(so)->>'due_date', ''), NULLIF(to_jsonb(so)->>'dueDate', ''))::timestamptz,
          pt.next_due_date
        ) AS due_date,
        COALESCE(to_jsonb(so)->>'branchId', to_jsonb(so)->>'branch_id', '') AS branch_id,
        COALESCE(pt.paid_amount, 0) AS paid_amount,
        GREATEST(
          CASE
            WHEN COALESCE(to_jsonb(so)->>'total_amount', to_jsonb(so)->>'totalAmount', '0') ~ '^-?\\d+(\\.\\d+)?$'
              THEN COALESCE(to_jsonb(so)->>'total_amount', to_jsonb(so)->>'totalAmount', '0')::numeric
            ELSE 0
          END - COALESCE(pt.paid_amount, 0) - COALESCE(pt.outstanding_receivable_amount, 0),
          0
        ) AS remaining_amount,
        COALESCE(pt.outstanding_receivable_amount, 0) AS outstanding_receivable_amount,
        COALESCE(pt.outstanding_receivable_count, 0) AS outstanding_receivable_count,
        COALESCE(pt.payment_methods, 'Unknown') AS payment_methods,
        COALESCE(pt.credit_terms_methods, '-') AS credit_terms_methods,
        COALESCE(pt.outstanding_payment_methods, 'Unknown') AS outstanding_payment_methods
      FROM tblsales_order so
      LEFT JOIN tblcustomer c
        ON c.id::text = COALESCE(to_jsonb(so)->>'customer_id', to_jsonb(so)->>'customerId', '')
      LEFT JOIN payment_totals pt
        ON pt.so_id = so.id::text
    )`;
  }

  private getSettledSalesPredicate(alias: string): string {
    return `(
      ${alias}.normalized_status IN ('complete', 'completed')
      OR (
        GREATEST(${alias}.total_amount - ${alias}.paid_amount, 0) <= 0
        AND ${alias}.normalized_status IN ('approved', 'released', 'delivered', 'partial', 'paid', 'remitted', 'complete', 'completed')
      )
    )`;
  }

  private getRecordedSalesAmountExpression(alias: string): string {
    return `(
      CASE
        WHEN ${alias}.paid_amount > 0 THEN ${alias}.paid_amount
        WHEN ${alias}.remaining_amount <= 0
          AND ${alias}.normalized_status IN ('paid', 'remitted', 'complete', 'completed')
          THEN ${alias}.total_amount
        ELSE 0
      END
    )`;
  }

  private getRecordedSalesPredicate(alias: string): string {
    // Only include cheque/credit-card payments if their status is paid/posted/cleared/complete/completed/remitted
    // Exclude all other cheques/cards from collected sales
    // All other payment methods remain included as before
    return `(
      ${this.getRecordedSalesAmountExpression(alias)} > 0
      AND ${alias}.normalized_status IN ('remitted', 'complete', 'completed')
      AND (
        (POSITION('cheque' IN COALESCE(${alias}.payment_methods, '')) = 0 AND POSITION('credit-card' IN COALESCE(${alias}.payment_methods, '')) = 0)
        OR EXISTS (
          SELECT 1 FROM payment_scope ps
          WHERE ps.so_id = ${alias}.so_id
            AND ps.normalized_method IN ('cheque', 'credit-card')
            AND COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid') IN ('paid', 'posted', 'cleared', 'complete', 'completed', 'remitted')
        )
      )
    )`;
  }

  private getOpenBalancePredicate(alias: string): string {
    return `(
      ${alias}.remaining_amount > 0
      AND ${alias}.normalized_status IN ('remitted', 'complete', 'completed')
      AND COALESCE(${alias}.credit_terms_methods, '-') <> '-'
    )`;
  }

  async getOverview(branchId?: number): Promise<DashboardResponse> {
    try {
      const branchParam = branchId ? String(branchId) : null;

      // --- Top KPIs: Sales Order counts ---
      let activePendingSoCount = 0;
      let completedSoCount = 0;
      let draftQuotationCount = 0;
      let totalSalesOrdersCount = 0;

      try {
        const activePendingResult = await this.databaseService.query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM tblsales_order WHERE status = 'pending' AND "salesType" = 'sales'`,
        );
        activePendingSoCount = this.toNumber(activePendingResult.rows[0]?.count);
      } catch { /* fault-tolerant */ }

      try {
        const completedResult = await this.databaseService.query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM tblsales_order WHERE status = 'complete' AND "salesType" = 'sales'`,
        );
        completedSoCount = this.toNumber(completedResult.rows[0]?.count);
      } catch { /* fault-tolerant */ }

      try {
        const draftResult = await this.databaseService.query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM tblsales_order WHERE status = 'draft' AND "salesType" = 'sales'`,
        );
        draftQuotationCount = this.toNumber(draftResult.rows[0]?.count);
      } catch { /* fault-tolerant */ }

      try {
        const totalResult = await this.databaseService.query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM tblsales_order WHERE "salesType" = 'sales' AND status != 'voided'`,
        );
        totalSalesOrdersCount = this.toNumber(totalResult.rows[0]?.count);
      } catch { /* fault-tolerant */ }

      // --- Operations: PO-based ---
      let totalPurchaseOrdersAmount = 0;
      let totalCreditTermsAmount = 0;
      let totalPaidPosAmount = 0;
      let stockAlertCount = 0;

      try {
        const totalPoResult = await this.databaseService.query<{ amount: string }>(
          `SELECT COALESCE(SUM(total_amount), 0)::text AS amount
           FROM tblpurchase_orders po
           WHERE REPLACE(REPLACE(LOWER(TRIM(COALESCE(po.status, 'pending'))), '_', '-'), ' ', '-') NOT IN ('voided', 'cancelled')
             AND po.created_at >= date_trunc('year', CURRENT_DATE)
             AND ($1::text IS NULL OR COALESCE(to_jsonb(po)->>'branchId', to_jsonb(po)->>'branch_id', '') = $1::text)`,
          [branchParam],
        );
        totalPurchaseOrdersAmount = this.toNumber(totalPoResult.rows[0]?.amount);
      } catch { /* fault-tolerant */ }

      try {
        const creditTermsResult = await this.databaseService.query<{ amount: string }>(
          `${this.getPurchaseOrdersDashboardBaseCte()}
           SELECT COALESCE(SUM(ps.balance), 0)::text AS amount
           FROM po_scope ps
           WHERE ps.payment_method IN ('Terms', 'Terms with DP', 'Installment')
             AND ps.balance > 0
             AND ($1::text IS NULL OR ps.branch_id = $1::text)`,
          [branchParam],
        );
        totalCreditTermsAmount = this.toNumber(creditTermsResult.rows[0]?.amount);
      } catch { /* fault-tolerant */ }

      try {
        const paidPosResult = await this.databaseService.query<{ amount: string }>(
          `${this.getPurchaseOrdersDashboardBaseCte()}
           SELECT COALESCE(SUM(ps.total_amount), 0)::text AS amount
           FROM po_scope ps
           WHERE ps.payment_status IN ('paid', 'posted', 'cleared', 'complete', 'completed')
             AND ($1::text IS NULL OR ps.branch_id = $1::text)`,
          [branchParam],
        );
        totalPaidPosAmount = this.toNumber(paidPosResult.rows[0]?.amount);
      } catch { /* fault-tolerant */ }

      try {
        const stockAlertResult = await this.databaseService.query<CountRow>(
          `SELECT COUNT(*)::text AS count
           FROM tblmaterials
           WHERE on_hand_stock <= reorder_level
             AND on_hand_stock >= 0
             AND deleted_at IS NULL`,
        );
        stockAlertCount = this.toNumber(stockAlertResult.rows[0]?.count);
      } catch { /* fault-tolerant */ }

      // --- Top Customers (annual ranking) ---
      let topCustomers: Array<{ rank: number; name: string; totalAmount: number; orderCount: number }> = [];
      try {
        const topCustomersResult = await this.databaseService.query<{ name: string; order_count: string; total_amount: string }>(
          `SELECT c.name, COUNT(so.id)::text AS order_count, COALESCE(SUM(so.total_amount), 0)::text AS total_amount
           FROM tblsales_order so
           LEFT JOIN tblcustomer c ON c.id::text = COALESCE(to_jsonb(so)->>'customer_id', to_jsonb(so)->>'customerId')
           WHERE so."salesType" = 'sales' AND so.status = 'complete'
             AND so.created_at >= date_trunc('year', CURRENT_DATE)
           GROUP BY c.name
           ORDER BY COALESCE(SUM(so.total_amount), 0) DESC
           LIMIT 10`,
        );
        topCustomers = topCustomersResult.rows.map((row, index) => ({
          rank: index + 1,
          name: String(row.name || 'Unknown Customer').trim(),
          totalAmount: this.toNumber(row.total_amount),
          orderCount: this.toNumber(row.order_count),
        }));
      } catch { /* fault-tolerant */ }

      // --- Top Suppliers (annual ranking by PO amount) ---
      let topSuppliers: Array<{ rank: number; name: string; totalAmount: number; poCount: number }> = [];
      try {
        const topSuppliersResult = await this.databaseService.query<{ name: string; po_count: string; total_amount: string }>(
          `SELECT v.name, COUNT(po.id)::text AS po_count, COALESCE(SUM(po.total_amount), 0)::text AS total_amount
           FROM tblpurchase_orders po
           LEFT JOIN tblvendors v ON v.id::text = po.vendor_id::text
           WHERE po.status != 'voided' AND po.created_at >= date_trunc('year', CURRENT_DATE)
           GROUP BY v.name
           ORDER BY COALESCE(SUM(po.total_amount), 0) DESC
           LIMIT 5`,
        );
        topSuppliers = topSuppliersResult.rows.map((row, index) => ({
          rank: index + 1,
          name: String(row.name || 'Unknown Supplier').trim(),
          totalAmount: this.toNumber(row.total_amount),
          poCount: this.toNumber(row.po_count),
        }));
      } catch { /* fault-tolerant */ }

      // --- Top Employees (annual ranking by sales amount) ---
      let topEmployees: Array<{ rank: number; name: string; totalSales: number; orderCount: number }> = [];
      try {
        const topEmployeesResult = await this.databaseService.query<{ username: string; name: string; order_count: string; total_sales: string }>(
          `SELECT u.username, COALESCE(u.full_name, u.username) AS name,
             COUNT(so.id)::text AS order_count, COALESCE(SUM(so.total_amount), 0)::text AS total_sales
           FROM tblsales_order so
           LEFT JOIN tblusers u ON u.id = so.created_by
           WHERE so."salesType" = 'sales' AND so.status = 'complete'
             AND so.created_at >= date_trunc('year', CURRENT_DATE)
           GROUP BY u.username, u.full_name
           ORDER BY COALESCE(SUM(so.total_amount), 0) DESC
           LIMIT 10`,
        );
        topEmployees = topEmployeesResult.rows.map((row, index) => ({
          rank: index + 1,
          name: String(row.name || row.username || 'Unknown').trim(),
          totalSales: this.toNumber(row.total_sales),
          orderCount: this.toNumber(row.order_count),
        }));
      } catch { /* fault-tolerant */ }

      // // --- NETO (Gross, Net, Outstanding) ---
      // let netoData = { gross: 0, discounts: 0, returns: 0, neto: 0, outstanding: 0 };
      // try {
      //   // Gross = SUM(total_amount) from completed SO this year (the invoice total)
      //   // This uses the same source as "Collected Sales" for consistency
      //   // const grossResult = await this.databaseService.query<{ gross: string }>(
      //   //   `SELECT COALESCE(SUM(
      //   //      CASE WHEN so.total_amount > 0 THEN so.total_amount
      //   //           ELSE (SELECT COALESCE(SUM(GREATEST(soi.rate - COALESCE(soi.discount, 0), 0) * soi.qty), 0) FROM tblsales_order_items soi WHERE soi.sales_order_id = so.id)
      //   //      END
      //   //    ), 0)::text AS gross
      //   //    FROM tblsales_order so
      //   //    WHERE so."salesType" = 'sales' AND so.status = 'complete'
      //   //      AND so.created_at >= date_trunc('year', CURRENT_DATE)`,
      //   // );
      //   const grossResult = await this.databaseService.query<{ gross: string }>(
      //     `SELECT COALESCE(SUM(
      //         CASE WHEN so.total_amount > 0 THEN 
      //           (SELECT COALESCE(SUM(GREATEST(soi.cost, 0) * soi.qty), 0) FROM tblsales_order_items soi WHERE soi.sales_order_id = so.id)
      //         ELSE 
      //           so.total_amount
      //         END
      //       ), 0)::text AS gross
      //     FROM tblsales_order so
      //     WHERE so."salesType" = 'sales' AND so.status = 'complete'
      //       AND so.created_at >= date_trunc('year', CURRENT_DATE)`,
      //   );
      //   // Discounts = SUM(discount * qty) from completed SO items this year
      //   const discountsResult = await this.databaseService.query<{ discounts: string }>(
      //     `SELECT COALESCE(SUM(soi.discount * soi.qty), 0)::text AS discounts
      //      FROM tblsales_order_items soi
      //      JOIN tblsales_order so ON so.id = soi.sales_order_id
      //      WHERE so."salesType" = 'sales' AND so.status = 'complete'
      //        AND so.created_at >= date_trunc('year', CURRENT_DATE)`,
      //   );

      //   // Payments Made = SUM of payment amounts for completed SOs this year
      //   const paymentsResult = await this.databaseService.query<{ paid: string }>(
      //     `SELECT COALESCE(SUM(sp.amount), 0)::text AS paid
      //      FROM tblsales_order_payments sp
      //      JOIN tblsales_order so ON so.id = sp.sales_order_id
      //      WHERE so."salesType" = 'sales' AND so.status = 'complete'
      //        AND so.created_at >= date_trunc('year', CURRENT_DATE)`,
      //   );

      //   const gross = this.toNumber(grossResult.rows[0]?.gross);
      //   const discounts = this.toNumber(discountsResult.rows[0]?.discounts);
      //   const neto = gross - discounts;
      //   const paid = this.toNumber(paymentsResult.rows[0]?.paid);
      //   const outstanding = neto - paid;

      //   netoData = { gross, discounts, returns: 0, neto, outstanding };
      // } catch { /* fault-tolerant */ }

      // --- NETO (Gross, Net, Outstanding reflecting Validated Payments) ---
let netoData = { gross: 0, discounts: 0, returns: 0, neto: 0, outstanding: 0 };
try {
  const costCalculations = await this.databaseService.query<{ gross_cost: string; paid_cost: string; outstanding_cost: string }>(
    `SELECT 
        -- 1. Gross Material Cost
        COALESCE(SUM(item_costs.material_cost), 0)::text AS gross_cost,
        
        -- 2. Net Cost (Only counts material cost covered by paid/validated collections)
        COALESCE(SUM(
          item_costs.material_cost * CASE 
            WHEN COALESCE(so.total_amount, 0) <= 0 THEN 0
            WHEN COALESCE(payments.total_paid, 0) >= so.total_amount THEN 1
            ELSE COALESCE(payments.total_paid, 0) / so.total_amount
          END
        ), 0)::text AS paid_cost,
        
        -- 3. Outstanding Cost (Unpaid terms or remaining balance)
        COALESCE(SUM(
          item_costs.material_cost * CASE 
            WHEN COALESCE(so.total_amount, 0) <= 0 THEN 1
            WHEN COALESCE(payments.total_paid, 0) >= so.total_amount THEN 0
            ELSE 1 - (COALESCE(payments.total_paid, 0) / so.total_amount)
          END
        ), 0)::text AS outstanding_cost
     FROM tblsales_order so
     
     -- Subquery: Calculate exact material cost for this sales order safely
     CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(GREATEST(soi.cost, 0) * soi.qty), 0) AS material_cost
        FROM tblsales_order_items soi 
        WHERE soi.sales_order_id = so.id
     ) item_costs
     
     -- Subquery: Sum up payments but CRITICALLY ignore 'unpaid' records
     CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(sp.amount), 0) AS total_paid
        FROM tblsales_order_payments sp
        WHERE sp.sales_order_id = so.id
          -- Only count money that has actually been cleared/paid
          AND LOWER(sp.status) != 'unpaid' 
     ) payments
     
     WHERE so."salesType" = 'sales' 
       AND LOWER(so.status) = 'complete'
       AND so.created_at >= date_trunc('year', CURRENT_DATE)`
  );

  const row = costCalculations.rows[0];
  const gross = this.toNumber(row?.gross_cost);
  const neto = this.toNumber(row?.paid_cost);            
  const outstanding = this.toNumber(row?.outstanding_cost); 

  netoData = { gross, discounts: 0, returns: 0, neto, outstanding };
} catch (error) {
  console.error("Dashboard NETO query failed:", error);
}

      const recordedSalesPredicate = this.getRecordedSalesPredicate('ss');
      const recordedSalesAmountExpression = this.getRecordedSalesAmountExpression('ss');
      const openBalancePredicate = this.getOpenBalancePredicate('ss');
      const overdueBalancePredicate = `${openBalancePredicate} AND ss.due_date IS NOT NULL AND (ss.due_date AT TIME ZONE 'UTC')::date < CURRENT_DATE`;

      const salesSummaryResult = await this.databaseService.query<SalesFinancialSummaryRow>(
        `${this.getSalesDashboardBaseCte()}
         SELECT
           COALESCE(SUM(${recordedSalesAmountExpression}) FILTER (WHERE ${recordedSalesPredicate}), 0)::text AS "settledAmount",
           COUNT(*) FILTER (WHERE ${recordedSalesPredicate})::text AS "settledCount",
           COALESCE(SUM(ss.remaining_amount) FILTER (WHERE ${openBalancePredicate}), 0)::text AS "unpaidAmount",
           COUNT(*) FILTER (WHERE ${openBalancePredicate})::text AS "unpaidCount",
           COALESCE(SUM(ss.remaining_amount) FILTER (WHERE ${overdueBalancePredicate}), 0)::text AS "overdueAmount",
           COUNT(*) FILTER (WHERE ${overdueBalancePredicate})::text AS "overdueCount",
           COALESCE(SUM(ss.outstanding_receivable_amount) FILTER (WHERE ss.normalized_status IN ('remitted', 'complete', 'completed')), 0)::text AS "chequeAmount",
           COALESCE(SUM(ss.outstanding_receivable_count) FILTER (WHERE ss.normalized_status IN ('remitted', 'complete', 'completed')), 0)::text AS "chequeCount"
         FROM sales_scope ss
         WHERE ($1::text IS NULL OR ss.branch_id = $1::text)`,
        [branchParam],
      );

      const activityResult = await this.databaseService.query<ActivityRow>(
        `WITH po_events AS (
           SELECT
             COALESCE(NULLIF(to_jsonb(po)->>'created_at', ''), NULLIF(to_jsonb(po)->>'createdAt', '')) AS "eventAt",
             CONCAT('PO ', COALESCE(to_jsonb(po)->>'po_number', to_jsonb(po)->>'poNumber', CONCAT('#', po.id::text)), ' created') AS text,
             'received'::text AS status
           FROM tblpurchase_orders po
           ORDER BY po.id DESC
           LIMIT 3
         ),
         so_events AS (
           SELECT
             COALESCE(NULLIF(to_jsonb(so)->>'created_at', ''), NULLIF(to_jsonb(so)->>'createdAt', '')) AS "eventAt",
             CONCAT('SO ', COALESCE(to_jsonb(so)->>'so_number', to_jsonb(so)->>'soNumber', CONCAT('#', so.id::text)), ' queued for processing') AS text,
             'dispatch'::text AS status
           FROM tblsales_order so
           WHERE ($1::text IS NULL OR COALESCE(to_jsonb(so)->>'branchId', to_jsonb(so)->>'branch_id', '') = $1::text)
           ORDER BY so.id DESC
           LIMIT 3
         ),
         payment_events AS (
           SELECT
             COALESCE(NULLIF(to_jsonb(sp)->>'created_at', ''), NULLIF(to_jsonb(sp)->>'createdAt', '')) AS "eventAt",
             CONCAT(
               'Payment posted for ',
               COALESCE(to_jsonb(so)->>'so_number', to_jsonb(so)->>'soNumber', CONCAT('SO#', so.id::text))
             ) AS text,
             'payment'::text AS status
           FROM tblso_payments sp
           LEFT JOIN tblsales_order so
             ON so.id::text = COALESCE(to_jsonb(sp)->>'so_id', to_jsonb(sp)->>'soId', '')
           ORDER BY sp.id DESC
           LIMIT 2
         )
         SELECT * FROM po_events
         UNION ALL
         SELECT * FROM so_events
         UNION ALL
         SELECT * FROM payment_events
         LIMIT 8`,
        [branchParam],
      );

      const settledSalesAmount = this.toNumber(salesSummaryResult.rows[0]?.settledAmount);
      const settledSalesCount = this.toNumber(salesSummaryResult.rows[0]?.settledCount);
      const unpaidSalesAmount = this.toNumber(salesSummaryResult.rows[0]?.unpaidAmount);
      const unpaidSalesCount = this.toNumber(salesSummaryResult.rows[0]?.unpaidCount);
      const overdueSalesAmount = this.toNumber(salesSummaryResult.rows[0]?.overdueAmount);
      const overdueSalesCount = this.toNumber(salesSummaryResult.rows[0]?.overdueCount);
      const chequeReceivableAmount = this.toNumber(salesSummaryResult.rows[0]?.chequeAmount);
      const chequeReceivableCount = this.toNumber(salesSummaryResult.rows[0]?.chequeCount);

      const topKpis: KpiCard[] = [
        {
          label: 'Active Pending SO',
          value: this.formatInteger(activePendingSoCount),
          change: `${this.formatInteger(activePendingSoCount)} pending`,
          trend: 'up',
        },
        {
          label: 'Completed SO',
          value: this.formatInteger(completedSoCount),
          change: `${this.formatInteger(completedSoCount)} complete`,
          trend: 'up',
        },
        {
          label: 'Draft / Quotation',
          value: this.formatInteger(draftQuotationCount),
          change: `${this.formatInteger(draftQuotationCount)} drafts`,
          trend: 'up',
        },
        {
          label: 'Total Sales Orders',
          value: this.formatInteger(totalSalesOrdersCount),
          change: `${this.formatInteger(totalSalesOrdersCount)} total`,
          trend: 'up',
        },
      ];

      const operations: OpsItem[] = [
        {
          label: 'Total Purchase Orders',
          value: this.formatCurrency(totalPurchaseOrdersAmount),
          hint: 'Year-to-date PO total',
          level: 'normal',
        },
        {
          label: 'Total Credit Terms',
          value: this.formatCurrency(totalCreditTermsAmount),
          hint: 'Unpaid terms, terms with DP, and installment',
          level: totalCreditTermsAmount > 0 ? 'warning' : 'normal',
        },
        {
          label: 'Total Paid Purchases',
          value: this.formatCurrency(totalPaidPosAmount),
          hint: 'Paid purchase orders this year',
          level: 'normal',
        },
        {
          label: 'Stock Alert',
          value: `${this.formatInteger(stockAlertCount)} materials`,
          hint: 'Low stock and out-of-stock materials',
          level: stockAlertCount > 0 ? 'critical' : 'normal',
        },
      ];

      const salesSummary: KpiCard[] = [
        {
          label: 'Collected Sales',
          value: this.formatCurrency(settledSalesAmount),
          change: `${this.formatInteger(settledSalesCount)} paid / remitted`,
          trend: 'up',
        },
        {
          label: 'Unpaid S.O.',
          value: this.formatCurrency(unpaidSalesAmount),
          change: `${this.formatInteger(unpaidSalesCount)} open balances`,
          trend: unpaidSalesAmount > 0 ? 'down' : 'up',
        },
        {
          label: 'Overdues',
          value: this.formatCurrency(overdueSalesAmount),
          change: `${this.formatInteger(overdueSalesCount)} overdue accounts`,
          trend: overdueSalesAmount > 0 ? 'down' : 'up',
        },
        {
          label: 'Cheque & Card Receivables',
          value: this.formatCurrency(chequeReceivableAmount),
          change: `${this.formatInteger(chequeReceivableCount)} outstanding cheques`,
          trend: chequeReceivableAmount > 0 ? 'down' : 'up',
        },
      ];

      const activityFeed = activityResult.rows
        .map((row) => ({
          time: this.formatActivityTime(row.eventAt),
          text: String(row.text ?? '').trim() || 'System activity recorded',
          status: row.status,
          sortableDate: row.eventAt ? new Date(row.eventAt).getTime() : 0,
        }))
        .sort((a, b) => b.sortableDate - a.sortableDate)
        .slice(0, 6)
        .map(({ time, text, status }) => ({ time, text, status }));

      const focusSegments: string[] = [];
      if (stockAlertCount > 0) {
        focusSegments.push(`${this.formatInteger(stockAlertCount)} low-stock materials`);
      }
      if (unpaidSalesAmount > 0) {
        focusSegments.push(`${this.formatCurrency(unpaidSalesAmount)} still collectible`);
      }

      return {
        success: true,
        item: {
          generatedAt: new Date().toISOString(),
          topKpis,
          operations,
          salesSummary,
          topCustomers,
          topSuppliers,
          topEmployees,
          netoData,
          activityFeed,
          todayFocus: focusSegments.length > 0 ? focusSegments.join(', ') : 'All core queues are stable today',
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unable to load dashboard overview',
      };
    }
  }

  async getSalesDetail(mode: DashboardSalesDetailMode, branchId?: number): Promise<{ success: boolean; items: unknown[] }> {
    try {
      const branchParam = branchId ? String(branchId) : null;
      const recordedSalesPredicate = this.getRecordedSalesPredicate('ss');
      const recordedSalesAmountExpression = this.getRecordedSalesAmountExpression('ss');
      const openBalancePredicate = this.getOpenBalancePredicate('ss');
      const overdueBalancePredicate = `${openBalancePredicate} AND ss.due_date IS NOT NULL AND (ss.due_date AT TIME ZONE 'UTC')::date < CURRENT_DATE`;

      if (mode === 'sales') {
        const result = await this.databaseService.query<{
          soNumber: string;
          customer: string;
          amount: string;
          status: string;
          date: string;
          method: string;
        }>(
          `${this.getSalesDashboardBaseCte()}
           SELECT
             ss.so_id::text AS id,
             ss.so_number::text AS "soNumber",
             ss.customer::text AS customer,
             ${recordedSalesAmountExpression}::text AS amount,
             CASE
               WHEN ss.normalized_status IN ('complete', 'completed') THEN ss.normalized_status
               WHEN ss.normalized_status = 'remitted' THEN 'remitted'
               WHEN ss.normalized_status = 'partial' THEN 'partial'
               ELSE 'paid'
             END::text AS status,
             ss.created_at::text AS date,
             ss.payment_methods::text AS method
           FROM sales_scope ss
           WHERE ${recordedSalesPredicate}
             AND ($1::text IS NULL OR ss.branch_id = $1::text)
           ORDER BY ss.created_at DESC
           LIMIT 100`,
          [branchParam],
        );

        return {
          success: true,
          items: result.rows.map((row) => ({
            id: row.id,
            soNumber: row.soNumber,
            customer: row.customer,
            amount: this.toNumber(row.amount),
            status: row.status,
            date: new Date(row.date),
            method: row.method,
          })),
        };
      }

      if (mode === 'unpaid' || mode === 'overdues') {
        const result = await this.databaseService.query<{
          soId: string;
          soNumber: string;
          customer: string;
          totalAmount: string;
          paidAmount: string;
          downPayment: string;
          method: string;
          dueDate: string;
        }>(
          `${this.getSalesDashboardBaseCte()},
           down_payment_scope AS (
             SELECT
               COALESCE(to_jsonb(sp)->>'so_id', to_jsonb(sp)->>'soId') AS so_id,
               COALESCE(SUM(
                 COALESCE(NULLIF(COALESCE(to_jsonb(sp)->>'downPayment', to_jsonb(sp)->>'down_payment', ''), '')::numeric, 0)
               ), 0) AS total_down_payment
             FROM tblso_payments sp
             WHERE LOWER(COALESCE(to_jsonb(sp)->>'status', '')) != 'paid'
               AND COALESCE(NULLIF(COALESCE(to_jsonb(sp)->>'downPayment', to_jsonb(sp)->>'down_payment', ''), '')::numeric, 0) > 0
             GROUP BY COALESCE(to_jsonb(sp)->>'so_id', to_jsonb(sp)->>'soId')
           )
           SELECT
             ss.so_id::text AS "soId",
             ss.so_number::text AS "soNumber",
             ss.customer::text AS customer,
             ss.total_amount::text AS "totalAmount",
             ss.paid_amount::text AS "paidAmount",
             COALESCE(dp.total_down_payment, 0)::text AS "downPayment",
             ss.credit_terms_methods::text AS method,
             ss.due_date::text AS "dueDate"
           FROM sales_scope ss
           LEFT JOIN down_payment_scope dp ON dp.so_id = ss.so_id
           WHERE ${mode === 'overdues' ? overdueBalancePredicate : openBalancePredicate}
             AND ($1::text IS NULL OR ss.branch_id = $1::text)
           ORDER BY ss.due_date ASC NULLS LAST, ss.created_at DESC
           LIMIT 100`,
          [branchParam],
        );

        return {
          success: true,
          items: result.rows.map((row) => {
            const total = this.toNumber(row.totalAmount);
            const paid = this.toNumber(row.paidAmount);
            const dp = this.toNumber(row.downPayment);
            const balance = Math.max(total - paid - dp, 0);
            return {
              id: row.soId,
              soId: Number(row.soId),
              soNumber: row.soNumber,
              customer: row.customer,
              totalAmount: total,
              paidAmount: paid,
              downPayment: dp,
              method: row.method,
              balance,
              dueDate: row.dueDate ? new Date(row.dueDate) : null,
            };
          }),
        };
      }

      if (mode === 'cheques') {
        // First check if tblsales_order_payments exists
        const tableCheck = await this.databaseService.query(
          `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tblsales_order_payments') AS exists`,
        );
        const hasSalesOrderPayments = tableCheck.rows[0]?.exists === true;

        const sopUnion = hasSalesOrderPayments
          ? `UNION ALL
             SELECT
               sop.id::text AS payment_id,
               sop.sales_order_id::text AS so_id,
               COALESCE(sop.amount, 0) AS amount,
               REPLACE(REPLACE(LOWER(TRIM(COALESCE(sop.method, ''))), '_', '-'), ' ', '-') AS normalized_method,
               REPLACE(REPLACE(LOWER(TRIM(COALESCE(sop.status, ''))), '_', '-'), ' ', '-') AS normalized_status,
               COALESCE(sop.reference_no, '-') AS reference_no,
               COALESCE(sop.check_no, '-') AS check_no,
               COALESCE(sop.bank_name, '-') AS bank_name,
               sop.post_dated::text AS post_dated
             FROM tblsales_order_payments sop`
          : '';

        const result = await this.databaseService.query<{
          paymentId: string;
          soNumber: string;
          customer: string;
          method: string;
          referenceNo: string;
          chequeNo: string;
          amount: string;
          bank: string;
          postDated: string;
          status: string;
        }>(
          `WITH payment_scope AS (
             -- Legacy payments from tblso_payments
             SELECT
               sp.id::text AS payment_id,
               COALESCE(to_jsonb(sp)->>'so_id', to_jsonb(sp)->>'soId') AS so_id,
               CASE
                 WHEN COALESCE(to_jsonb(sp)->>'amount', '0') ~ '^-?\\d+(\\.\\d+)?$'
                   THEN COALESCE(to_jsonb(sp)->>'amount', '0')::numeric
                 ELSE 0
               END AS amount,
               REPLACE(REPLACE(LOWER(TRIM(COALESCE(to_jsonb(sp)->>'method', ''))), '_', '-'), ' ', '-') AS normalized_method,
               REPLACE(REPLACE(LOWER(TRIM(COALESCE(to_jsonb(sp)->>'status', ''))), '_', '-'), ' ', '-') AS normalized_status,
               COALESCE(to_jsonb(sp)->>'reference_no', to_jsonb(sp)->>'referenceNo', '-') AS reference_no,
               COALESCE(to_jsonb(sp)->>'check_no', to_jsonb(sp)->>'checkNo', '-') AS check_no,
               COALESCE(to_jsonb(sp)->>'bank_name', to_jsonb(sp)->>'bankName', '-') AS bank_name,
               COALESCE(to_jsonb(sp)->>'post_dated', to_jsonb(sp)->>'postDated', null) AS post_dated
             FROM tblso_payments sp

             ${sopUnion}
           )
           SELECT
             ps.payment_id::text AS "paymentId",
             COALESCE(to_jsonb(so)->>'so_number', to_jsonb(so)->>'soNumber', CONCAT('#', so.id::text)) AS "soNumber",
             COALESCE(to_jsonb(c)->>'name', 'Unknown Customer') AS customer,
             ps.normalized_method::text AS method,
             ps.reference_no::text AS "referenceNo",
             ps.check_no::text AS "chequeNo",
             ps.amount::text AS amount,
             ps.bank_name::text AS bank,
             COALESCE(ps.post_dated::text, '') AS "postDated",
             COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid')::text AS status
           FROM payment_scope ps
           LEFT JOIN tblsales_order so ON so.id::text = ps.so_id
           LEFT JOIN tblcustomer c ON c.id::text = COALESCE(to_jsonb(so)->>'customer_id', to_jsonb(so)->>'customerId', '')
           WHERE ps.normalized_method IN ('cheque', 'credit-card')
             AND COALESCE(NULLIF(ps.normalized_status, ''), 'unpaid') NOT IN ('paid', 'posted', 'cleared', 'complete', 'completed', 'remitted')
             AND REPLACE(REPLACE(LOWER(TRIM(COALESCE(so.status, 'pending'))), '_', '-'), ' ', '-') NOT IN ('voided', 'cancelled', 'draft')
             AND ($1::text IS NULL OR COALESCE(so."branchId"::text, '') = $1::text)
           ORDER BY so.id DESC
           LIMIT 100`,
          [branchParam],
        );

        return {
          success: true,
          items: result.rows.map((row) => ({
            id: row.paymentId,
            paymentId: Number(row.paymentId),
            soNumber: row.soNumber,
            customer: row.customer,
            method: row.method === 'credit-card' ? 'Credit Card' : 'Cheque',
            referenceNo: row.method === 'credit-card' ? row.referenceNo : row.chequeNo,
            chequeNo: row.chequeNo,
            amount: this.toNumber(row.amount),
            bank: row.bank,
            postDated: row.postDated ? new Date(row.postDated) : null,
            status: row.status,
          })),
        };
      }

      return { success: false, items: [] };
    } catch (error) {
      return { success: false, items: [] };
    }
  }

  async settleSalesOrder(
    payload: {
      salesOrderId?: number;
      mode?: DashboardSettlementMode;
      amount?: number;
      bankAmount?: number;
      chequeAmount?: number;
      bankName?: string | null;
      checkNo?: string | null;
      postDated?: string | null;
    },
    branchId?: number,
    auditActor?: AuditActorContext,
  ): Promise<{ success: boolean; message: string }> {
    const salesOrderId = Number(payload.salesOrderId);
    if (!Number.isFinite(salesOrderId) || salesOrderId <= 0) {
      throw new BadRequestException('A valid salesOrderId is required');
    }

    const beforeSnapshot = await this.getSalesSettlementAuditSnapshot(salesOrderId, branchId);

    const mode = payload.mode;
    if (!mode || !['partial', 'full', 'cheque', 'split'].includes(mode)) {
      throw new BadRequestException('A valid settlement mode is required');
    }

    await this.databaseService.withTransaction(async (client) => {
      const state = await this.loadSalesSettlementState(client, salesOrderId, branchId);
      const remainingAmount = this.toNumber(state.remainingAmount);
      if (remainingAmount <= 0) {
        throw new BadRequestException('This sales order no longer has an open balance');
      }

      if (mode === 'partial' || mode === 'full') {
        const amount = mode === 'full'
          ? remainingAmount
          : Math.min(Math.max(this.toNumber(payload.amount), 0), remainingAmount);

        if (amount <= 0) {
          throw new BadRequestException('Partial settlement amount must be greater than zero');
        }

        await this.insertSalesPaymentRecord(client, salesOrderId, {
          method: 'Bank Transfer',
          amount,
          status: 'paid',
          paymentDate: new Date().toISOString(),
        });
      }

      if (mode === 'cheque') {
        await this.insertSalesPaymentRecord(client, salesOrderId, {
          method: 'Cheque',
          amount: remainingAmount,
          status: 'unpaid',
          checkNo: String(payload.checkNo ?? '').trim() || null,
          bankName: String(payload.bankName ?? '').trim() || null,
          postDated: this.toIsoDateOrNull(payload.postDated),
        });
      }

      if (mode === 'split') {
        const bankAmount = Math.max(this.toNumber(payload.bankAmount), 0);
        const chequeAmount = Math.max(this.toNumber(payload.chequeAmount), 0);

        if (bankAmount <= 0 || chequeAmount <= 0) {
          throw new BadRequestException('Split settlement requires both bank and cheque amounts.');
        }

        if (Math.abs(bankAmount + chequeAmount - remainingAmount) > 0.01) {
          throw new BadRequestException('Split settlement must match the full remaining balance.');
        }

        await this.insertSalesPaymentRecord(client, salesOrderId, {
          method: 'Bank Transfer',
          amount: bankAmount,
          status: 'paid',
          paymentDate: new Date().toISOString(),
        });

        await this.insertSalesPaymentRecord(client, salesOrderId, {
          method: 'Cheque',
          amount: chequeAmount,
          status: 'unpaid',
          checkNo: String(payload.checkNo ?? '').trim() || null,
          bankName: String(payload.bankName ?? '').trim() || null,
          postDated: this.toIsoDateOrNull(payload.postDated),
        });
      }

      await this.updateSalesOrderStatusForSettlement(client, salesOrderId, branchId);
    });

    const afterSnapshot = await this.getSalesSettlementAuditSnapshot(salesOrderId, branchId);
    await this.auditLogService.logMutation({
      action: 'DASHBOARD_SALES_SETTLEMENT',
      entityType: 'sales-settlement',
      entityId: salesOrderId,
      actor: auditActor,
      description: `Recorded ${mode} settlement for sales order #${salesOrderId}`,
      requestBody: payload as Record<string, unknown>,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        mode,
      },
    });

    return {
      success: true,
      message:
        mode === 'cheque'
          ? 'Balance transferred to cheque receivables'
          : mode === 'split'
            ? 'Split settlement recorded successfully'
            : 'Settlement recorded successfully',
    };
  }

  async verifySalesReceivable(
    payload: { paymentId?: number; method?: DashboardReceivableVerificationMode },
    branchId?: number,
    userId?: number,
  ): Promise<{ success: boolean; message: string }> {
    const paymentId = Number(payload.paymentId);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      throw new BadRequestException('A valid paymentId is required');
    }

    await this.databaseService.withTransaction(async (client) => {
      // Try tblso_payments first (UUID id)
      let result = await client.query<{
        paymentId: string;
        salesOrderId: string;
        method: string;
        branchId: string | null;
        source: string;
      }>(
        `SELECT
           sp.id::text AS "paymentId",
           COALESCE(to_jsonb(sp)->>'so_id', to_jsonb(sp)->>'soId') AS "salesOrderId",
           REPLACE(REPLACE(LOWER(TRIM(COALESCE(to_jsonb(sp)->>'method', ''))), '_', '-'), ' ', '-') AS method,
           NULLIF(COALESCE(to_jsonb(so)->>'branchId', to_jsonb(so)->>'branch_id', ''), '') AS "branchId",
           'tblso_payments' AS source
         FROM tblso_payments sp
         LEFT JOIN tblsales_order so
           ON so.id::text = COALESCE(to_jsonb(sp)->>'so_id', to_jsonb(sp)->>'soId')
         WHERE sp.id::text = $1
         LIMIT 1`,
        [String(paymentId)],
      );

      // If not found, try tblsales_order_payments (BIGSERIAL id)
      if (result.rowCount === 0) {
        result = await client.query<{
          paymentId: string;
          salesOrderId: string;
          method: string;
          branchId: string | null;
          source: string;
        }>(
          `SELECT
             sop.id::text AS "paymentId",
             sop.sales_order_id::text AS "salesOrderId",
             REPLACE(REPLACE(LOWER(TRIM(COALESCE(sop.method, ''))), '_', '-'), ' ', '-') AS method,
             NULLIF(COALESCE(so."branchId"::text, ''), '') AS "branchId",
             'tblsales_order_payments' AS source
           FROM tblsales_order_payments sop
           LEFT JOIN tblsales_order so ON so.id = sop.sales_order_id
           WHERE sop.id = $1
           LIMIT 1`,
          [paymentId],
        );
      }

      if (result.rowCount === 0) {
        throw new NotFoundException('Receivable payment not found');
      }

      const payment = result.rows[0];
      if (!['cheque', 'credit-card'].includes(payment.method)) {
        throw new BadRequestException('Only cheque or credit card receivables can be verified here');
      }
      if (branchId && payment.branchId && payment.branchId !== String(branchId)) {
        throw new NotFoundException('Receivable payment not found in the current branch');
      }

      // Update the correct table based on where the payment was found
      if (payment.source === 'tblsales_order_payments') {
        const updateParams: unknown[] = ['paid'];
        const updates = [`status = $1`];
        updateParams.push(new Date().toISOString());
        updates.push(`payment_date = $${updateParams.length}`);
        updateParams.push(paymentId);

        await client.query(
          `UPDATE tblsales_order_payments
           SET ${updates.join(', ')}
           WHERE id = $${updateParams.length}`,
          updateParams,
        );
      } else {
        const paymentColumns = await this.getTableColumns(client, 'tblso_payments');
        const statusColumn = this.pickColumn(paymentColumns, ['status']);
        const paymentDateColumn = this.pickColumn(paymentColumns, ['payment_date', 'paymentDate']);
        if (!statusColumn) {
          throw new BadRequestException('Sales payment status column is not configured as expected');
        }

        const updateParams: unknown[] = ['paid'];
        const updates = [`"${statusColumn}" = $1`];
        if (paymentDateColumn) {
          updateParams.push(new Date().toISOString());
          updates.push(`"${paymentDateColumn}" = $${updateParams.length}`);
        }
        updateParams.push(paymentId);

        await client.query(
          `UPDATE tblso_payments
           SET ${updates.join(', ')}
           WHERE id = $${updateParams.length}`,
          updateParams,
        );
      }

      await this.updateSalesOrderStatusForSettlement(client, Number(payment.salesOrderId), branchId);
    });

    // Log the verification in audit log
    await this.auditLogService.logMutation({
      action: 'DASHBOARD_VERIFY_RECEIVABLE',
      entityType: 'sales-payment',
      entityId: paymentId,
      actor: { userId },
      description: `Verified ${payload.method ?? 'cheque'} receivable payment #${paymentId} as paid`,
      metadata: {
        paymentId,
        method: payload.method,
        branchId,
      },
    });

    return {
      success: true,
      message: 'Receivable payment verified successfully',
    };
  }

  private getPurchaseOrdersDashboardBaseCte(): string {
    return `
      WITH po_payment_scope AS (
        SELECT
          COALESCE(
            to_jsonb(pp)->>'po_id',
            to_jsonb(pp)->>'poId',
            to_jsonb(pp)->>'purchase_id',
            to_jsonb(pp)->>'purchaseId',
            to_jsonb(pp)->>'purchase_order_id',
            to_jsonb(pp)->>'purchaseOrderId'
          ) AS po_id,
          COALESCE(to_jsonb(pp)->>'method', 'Cash') AS method,
          COALESCE(NULLIF(to_jsonb(pp)->>'amount', '')::numeric, 0) AS payment_amount,
          COALESCE(
            NULLIF(COALESCE(to_jsonb(pp)->>'down_payment', to_jsonb(pp)->>'downPayment', ''), '')::numeric,
            0
          ) AS down_payment,
          LOWER(REPLACE(REPLACE(TRIM(COALESCE(to_jsonb(pp)->>'status', 'unpaid')), '_', '-'), ' ', '-')) AS payment_status,
          COALESCE(to_jsonb(pp)->>'terms_due_date', to_jsonb(pp)->>'termsDueDate', '') AS terms_due_date,
          pp.id AS payment_id
        FROM tblpo_payments pp
      ),
      po_latest_payment AS (
        SELECT DISTINCT ON (po_id)
          po_id,
          method,
          payment_amount,
          down_payment,
          payment_status,
          terms_due_date,
          payment_id
        FROM po_payment_scope
        WHERE po_id IS NOT NULL AND po_id <> ''
        ORDER BY po_id, payment_id DESC
      ),
      po_scope AS (
        SELECT
          po.id::text AS po_id,
          COALESCE(po.po_number::text, CONCAT('PO-', po.id::text)) AS po_number,
          COALESCE(v.name, 'Unknown Vendor') AS vendor,
          COALESCE(po.total_amount, 0) AS total_amount,
          REPLACE(REPLACE(LOWER(TRIM(COALESCE(po.status, 'pending'))), '_', '-'), ' ', '-') AS po_status,
          COALESCE(to_jsonb(po)->>'branchId', to_jsonb(po)->>'branch_id', '') AS branch_id,
          po.created_at,
          COALESCE(plp.method, '-') AS payment_method,
          COALESCE(plp.payment_status, 'unknown') AS payment_status,
          plp.payment_id::text AS payment_id,
          plp.terms_due_date,
          COALESCE(plp.down_payment, 0) AS down_payment,
          CASE
            WHEN plp.po_id IS NULL THEN COALESCE(po.total_amount, 0)
            WHEN COALESCE(plp.payment_status, 'unknown') IN ('paid', 'posted', 'cleared', 'complete', 'completed') THEN 0
            WHEN LOWER(COALESCE(plp.method, '')) = 'terms with dp'
              THEN GREATEST(COALESCE(po.total_amount, 0) - COALESCE(plp.down_payment, 0), 0)
            ELSE COALESCE(po.total_amount, 0)
          END AS balance
        FROM tblpurchase_orders po
        LEFT JOIN tblvendors v ON v.id::text = po.vendor_id::text
        LEFT JOIN po_latest_payment plp ON plp.po_id = po.id::text
        WHERE REPLACE(REPLACE(LOWER(TRIM(COALESCE(po.status, 'pending'))), '_', '-'), ' ', '-') NOT IN ('voided', 'cancelled')
          AND po.created_at >= date_trunc('year', CURRENT_DATE)
      )`;
  }

  async getOperationsDetail(mode: DashboardOperationDetailMode, branchId?: number): Promise<{ success: boolean; items: unknown[] }> {
    try {
      const branchParam = branchId ? String(branchId) : null;

      if (mode === 'purchase-orders') {
        const result = await this.databaseService.query<{
          id: string;
          poNumber: string;
          vendor: string;
          amount: string;
          poStatus: string;
          paymentStatus: string;
          paymentMethod: string;
          createdAt: string;
        }>(
          `${this.getPurchaseOrdersDashboardBaseCte()}
           SELECT
             ps.po_id AS id,
             ps.po_number AS "poNumber",
             ps.vendor,
             ps.total_amount::text AS amount,
             ps.po_status AS "poStatus",
             ps.payment_status AS "paymentStatus",
             ps.payment_method AS "paymentMethod",
             ps.created_at::text AS "createdAt"
           FROM po_scope ps
           WHERE ($1::text IS NULL OR ps.branch_id = $1::text)
           ORDER BY ps.created_at DESC
           LIMIT 100`,
          [branchParam],
        );

        return {
          success: true,
          items: result.rows.map((row) => ({
            id: row.id,
            poNumber: row.poNumber,
            vendor: row.vendor,
            amount: this.toNumber(row.amount),
            poStatus: row.poStatus,
            paymentStatus: row.paymentStatus,
            paymentMethod: row.paymentMethod,
            createdAt: row.createdAt ? new Date(row.createdAt) : null,
          })),
        };
      }

      if (mode === 'credit-terms') {
        const result = await this.databaseService.query<{
          id: string;
          paymentId: string;
          poNumber: string;
          vendor: string;
          totalAmount: string;
          balance: string;
          paymentMethod: string;
          paymentStatus: string;
          dueDate: string;
        }>(
          `${this.getPurchaseOrdersDashboardBaseCte()}
           SELECT
             ps.po_id AS id,
             ps.payment_id AS "paymentId",
             ps.po_number AS "poNumber",
             ps.vendor,
             ps.total_amount::text AS "totalAmount",
             ps.balance::text AS balance,
             ps.payment_method AS "paymentMethod",
             ps.payment_status AS "paymentStatus",
             ps.terms_due_date AS "dueDate"
           FROM po_scope ps
           WHERE ps.payment_method IN ('Terms', 'Terms with DP', 'Installment')
             AND ps.balance > 0
             AND ps.payment_status NOT IN ('paid', 'posted', 'cleared', 'complete', 'completed')
             AND ($1::text IS NULL OR ps.branch_id = $1::text)
           ORDER BY NULLIF(ps.terms_due_date, '') ASC NULLS LAST, ps.created_at DESC
           LIMIT 100`,
          [branchParam],
        );

        return {
          success: true,
          items: result.rows.map((row) => ({
            id: row.id,
            poId: Number(row.id),
            paymentId: row.paymentId ?? null,
            poNumber: row.poNumber,
            vendor: row.vendor,
            totalAmount: this.toNumber(row.totalAmount),
            balance: this.toNumber(row.balance),
            paymentMethod: row.paymentMethod,
            paymentStatus: row.paymentStatus,
            dueDate: row.dueDate ? new Date(row.dueDate) : null,
          })),
        };
      }

      if (mode === 'paid-purchases') {
        const result = await this.databaseService.query<{
          id: string;
          poNumber: string;
          vendor: string;
          amount: string;
          poStatus: string;
          paymentStatus: string;
          paymentMethod: string;
          createdAt: string;
        }>(
          `${this.getPurchaseOrdersDashboardBaseCte()}
           SELECT
             ps.po_id AS id,
             ps.po_number AS "poNumber",
             ps.vendor,
             ps.total_amount::text AS amount,
             ps.po_status AS "poStatus",
             ps.payment_status AS "paymentStatus",
             ps.payment_method AS "paymentMethod",
             ps.created_at::text AS "createdAt"
           FROM po_scope ps
           WHERE ps.payment_status IN ('paid', 'posted', 'cleared', 'complete', 'completed')
             AND ($1::text IS NULL OR ps.branch_id = $1::text)
           ORDER BY ps.created_at DESC
           LIMIT 100`,
          [branchParam],
        );

        return {
          success: true,
          items: result.rows.map((row) => ({
            id: row.id,
            poNumber: row.poNumber,
            vendor: row.vendor,
            amount: this.toNumber(row.amount),
            poStatus: row.poStatus,
            paymentStatus: row.paymentStatus,
            paymentMethod: row.paymentMethod,
            createdAt: row.createdAt ? new Date(row.createdAt) : null,
          })),
        };
      }

      if (mode === 'stock-alerts') {
        const result = await this.databaseService.query<{
          id: string;
          materialName: string;
          materialCode: string;
          unit: string;
          onHandStock: string;
          reorderLevel: string;
          stockStatus: string;
        }>(
          `SELECT
             m.id::text AS id,
             COALESCE(m.material_name, 'Unknown Material') AS "materialName",
             COALESCE(m.material_code, '-') AS "materialCode",
             COALESCE(m.unit, 'PCS') AS unit,
             COALESCE(m.on_hand_stock, 0)::text AS "onHandStock",
             COALESCE(m.reorder_level, 0)::text AS "reorderLevel",
             CASE
               WHEN COALESCE(m.on_hand_stock, 0) <= 0 THEN 'out-of-stock'
               WHEN COALESCE(m.on_hand_stock, 0) <= COALESCE(m.reorder_level, 0) THEN 'low-stock'
               ELSE 'normal'
             END AS "stockStatus"
           FROM tblmaterials m
           WHERE m.deleted_at IS NULL
             AND COALESCE(m.on_hand_stock, 0) <= COALESCE(m.reorder_level, 0)
           ORDER BY COALESCE(m.on_hand_stock, 0) ASC, m.material_name ASC
           LIMIT 100`,
        );

        return {
          success: true,
          items: result.rows.map((row) => ({
            id: row.id,
            materialId: Number(row.id),
            materialName: row.materialName,
            materialCode: row.materialCode,
            unit: row.unit,
            onHandStock: this.toNumber(row.onHandStock),
            reorderLevel: this.toNumber(row.reorderLevel),
            stockStatus: row.stockStatus,
          })),
        };
      }

      return { success: false, items: [] };
    } catch (error) {
      return { success: false, items: [] };
    }
  }

  async settlePurchaseOrder(
    payload: { purchaseOrderId?: number; paymentId?: string },
    branchId?: number,
  ): Promise<{ success: boolean; message: string }> {
    const purchaseOrderId = Number(payload.purchaseOrderId);
    const paymentId = String(payload.paymentId ?? '').trim();

    if (!Number.isFinite(purchaseOrderId) || purchaseOrderId <= 0) {
      throw new BadRequestException('A valid purchaseOrderId is required');
    }

    const branchParam = branchId ? String(branchId) : null;
    const stateResult = await this.databaseService.query<{
      paymentId: string;
      balance: string;
      paymentMethod: string;
      paymentStatus: string;
      branchId: string;
    }>(
      `${this.getPurchaseOrdersDashboardBaseCte()}
       SELECT
         ps.payment_id AS "paymentId",
         ps.balance::text AS balance,
         ps.payment_method AS "paymentMethod",
         ps.payment_status AS "paymentStatus",
         ps.branch_id AS "branchId"
       FROM po_scope ps
       WHERE ps.po_id = $1::text
         AND ($2::text IS NULL OR ps.branch_id = $2::text)
       LIMIT 1`,
      [String(purchaseOrderId), branchParam],
    );

    if (stateResult.rowCount === 0) {
      throw new NotFoundException('Purchase order not found');
    }

    const state = stateResult.rows[0];
    if (!['Terms', 'Terms with DP', 'Installment'].includes(state.paymentMethod)) {
      throw new BadRequestException('Only credit-term purchase orders can be settled from the dashboard');
    }

    if (['paid', 'posted', 'cleared', 'complete', 'completed'].includes(state.paymentStatus)) {
      throw new BadRequestException('This purchase order is already settled');
    }

    if (this.toNumber(state.balance) <= 0) {
      throw new BadRequestException('This purchase order no longer has an open balance');
    }

    const targetPaymentId = paymentId || String(state.paymentId ?? '').trim();

    if (!targetPaymentId) {
      throw new BadRequestException('Unable to resolve the purchase order payment record');
    }

    await this.databaseService.query(
      `UPDATE tblpo_payments
       SET status = 'paid'
       WHERE id::text = $1`,
      [targetPaymentId],
    );

    return {
      success: true,
      message: 'Purchase order payment settled successfully',
    };
  }
}
