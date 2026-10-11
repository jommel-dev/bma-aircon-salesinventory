import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from 'src/database/database.service';
import { AuditActorContext, AuditLogService, redactAuditRequestBody } from 'src/audit-log/audit-log.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';

interface BackorderItem {
  salesOrderItemId: number;
  materialId: number;
  description: string;
  orderedQty: number;
  onHandQty: number;
  backorderQty: number;
}

interface BackorderCreationResult {
  backorderId: number;
  materialId: number;
  backorderQty: number;
  createdAt: string;
}

@Injectable()
export class BackorderService {
  private recordingColumnReady = false;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditLogService: AuditLogService,
    private readonly materialStockService: MaterialStockService,
  ) {}

  /**
   * Process backorders for a sales order when it transitions to pending/approved status
   * Creates backorder records for any line items where ordered qty > available stock.
   * Does not deduct on_hand_stock — completion is the only outbound deduct path.
   */
  async processBackordersForSalesOrder(
    salesOrderId: number,
    userId?: number,
  ): Promise<{ backorderCount: number; createdBackorders: BackorderCreationResult[] }> {
    if (!(await this.isRecordingEnabled())) {
      return { backorderCount: 0, createdBackorders: [] };
    }

    const createdBackorders: BackorderCreationResult[] = [];

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const statusResult = await client.query<{ status: string | null }>(
          `SELECT LOWER(TRIM(COALESCE(status, ''))) AS status
           FROM tblsales_order
           WHERE id = $1`,
          [salesOrderId],
        );
        const soStatus = String(statusResult.rows[0]?.status ?? '');
        const isCompletedSo = soStatus === 'complete' || soStatus === 'completed';

        const itemsResult = await client.query(
          `SELECT
            soi.id as item_id,
            soi.sales_order_id,
            soi.material_id,
            soi.description,
            soi.qty as ordered_qty,
            COALESCE(soi.is_non_inventory, false) as is_non_inventory,
            COALESCE(m.on_hand_stock, 0) as on_hand_qty,
            COALESCE(deducted.qty, 0) as already_deducted_qty
          FROM tblsales_order_items soi
          LEFT JOIN tblmaterials m ON soi.material_id = m.id
          LEFT JOIN (
            SELECT
              source_id,
              material_id,
              SUM(
                CASE
                  WHEN UPPER(TRIM(COALESCE(movement_type, ''))) = 'OUT' THEN qty
                  WHEN UPPER(TRIM(COALESCE(movement_type, ''))) = 'RETURN' THEN -qty
                  ELSE 0
                END
              )::int AS qty
            FROM tblmaterial_stock_movement
            WHERE UPPER(TRIM(COALESCE(source_type, ''))) = 'SO'
            GROUP BY source_id, material_id
          ) deducted
            ON deducted.source_id = soi.sales_order_id
           AND deducted.material_id = soi.material_id
          WHERE soi.sales_order_id = $1 AND soi.material_id IS NOT NULL`,
          [salesOrderId],
        );

        const items = itemsResult.rows as Array<{
          item_id: number;
          sales_order_id: number;
          material_id: number;
          description: string;
          ordered_qty: number;
          is_non_inventory: boolean;
          on_hand_qty: number;
          already_deducted_qty: number;
        }>;

        // Process each item to check for backorders
        for (const item of items) {
          if (item.is_non_inventory) {
            continue;
          }
          const deductedQty = Math.max(0, Number(item.already_deducted_qty) || 0);
          const coveredQty = isCompletedSo
            ? deductedQty
            : Math.max(0, Number(item.on_hand_qty) || 0);
          if (item.ordered_qty > coveredQty) {
            const backorderQty = item.ordered_qty - coveredQty;

            const existing = await client.query(
              `SELECT id FROM tblmaterial_backorder
               WHERE sales_order_id = $1
                 AND sales_order_item_id = $2
                 AND status IN ('pending', 'partial_fulfilled')
               LIMIT 1`,
              [salesOrderId, item.item_id],
            );
            if ((existing.rowCount ?? 0) > 0) {
              continue;
            }

            // Create backorder record
            const backorderResult = await client.query(
              `INSERT INTO tblmaterial_backorder
                (sales_order_id, sales_order_item_id, material_id, on_hand_qty, ordered_qty, backorder_qty, created_by)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id, created_at`,
              [
                salesOrderId,
                item.item_id,
                item.material_id,
                item.on_hand_qty,
                item.ordered_qty,
                backorderQty,
                userId || null,
              ],
            );

            if (backorderResult.rowCount > 0) {
              createdBackorders.push({
                backorderId: backorderResult.rows[0].id,
                materialId: item.material_id,
                backorderQty,
                createdAt: backorderResult.rows[0].created_at,
              });
            }
          }
        }

        if (isCompletedSo) {
          const materialIds = [
            ...new Set(
              items
                .filter((item) => !item.is_non_inventory)
                .map((item) => Number(item.material_id))
                .filter((id) => Number.isFinite(id) && id > 0),
            ),
          ];
          for (const materialId of materialIds) {
            const stockResult = await client.query<{ on_hand: number }>(
              `SELECT COALESCE(on_hand_stock, 0)::int AS on_hand
               FROM tblmaterials
               WHERE id = $1`,
              [materialId],
            );
            const onHand = Number(stockResult.rows[0]?.on_hand ?? 0);
            if (onHand > 0) {
              await this.allocateIncomingStockToBackorders(materialId, onHand, {
                client,
                userId,
              });
            }
          }
        }

        return { backorderCount: createdBackorders.length };
      });

      return {
        backorderCount: result.backorderCount,
        createdBackorders,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? `Failed to process backorders: ${error.message}`
          : 'Failed to process backorders',
      );
    }
  }

  /**
   * Get all backorders for a sales order
   */
  async getBackordersForSalesOrder(salesOrderId: number) {
    const result = await this.databaseService.query(
      `SELECT 
        mb.id,
        mb.sales_order_id,
        mb.material_id,
        m.material_name,
        m.material_code,
        mb.on_hand_qty,
        mb.ordered_qty,
        mb.backorder_qty,
        mb.fulfilled_qty,
        (mb.backorder_qty - COALESCE(mb.fulfilled_qty, 0)) AS remaining_qty,
        mb.status,
        mb.expected_fulfillment_date,
        mb.supplier_reference,
        mb.backorder_reason,
        mb.created_at,
        mb.created_by,
        u.username as created_by_name
      FROM tblmaterial_backorder mb
      LEFT JOIN tblmaterials m ON mb.material_id = m.id
      LEFT JOIN tblusers u ON mb.created_by = u.id
      WHERE mb.sales_order_id = $1
      ORDER BY mb.created_at DESC`,
      [salesOrderId],
    );

    return result.rows;
  }

  /**
   * Get all pending backorders
   */
  async getPendingBackorders(limit: number = 50, offset: number = 0) {
    const result = await this.databaseService.query(
      `SELECT 
        mb.id,
        mb.sales_order_id,
        mb.material_id,
        m.material_name,
        m.material_code,
        mb.backorder_qty,
        mb.fulfilled_qty,
        (mb.backorder_qty - COALESCE(mb.fulfilled_qty, 0)) AS remaining_qty,
        mb.status,
        mb.expected_fulfillment_date,
        mb.supplier_reference,
        mb.created_at,
        c.name AS customer_name,
        u.username as created_by_name
      FROM tblmaterial_backorder mb
      LEFT JOIN tblmaterials m ON mb.material_id = m.id
      LEFT JOIN tblsales_order so ON mb.sales_order_id = so.id
      LEFT JOIN tblcustomer c ON so.customer_id = c.id
      LEFT JOIN tblusers u ON mb.created_by = u.id
      WHERE mb.status IN ('pending', 'partial_fulfilled')
      ORDER BY mb.expected_fulfillment_date ASC, mb.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const countResult = await this.databaseService.query(
      `SELECT COUNT(*) as total FROM tblmaterial_backorder
       WHERE status IN ('pending', 'partial_fulfilled')`,
      [],
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  }

  /**
   * Paginated backorder list for the Back Orders screen.
   * status: open | pending | partial_fulfilled | fulfilled | cancelled | all
   */
  async listBackorders(options: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const status = this.normalizeListStatus(options.status);
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;
    const search = String(options.search ?? '').trim();

    const where: string[] = [];
    const params: unknown[] = [];

    if (status === 'open') {
      where.push(`mb.status IN ('pending', 'partial_fulfilled')`);
    } else if (status !== 'all') {
      params.push(status);
      where.push(`mb.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const placeholder = `$${params.length}`;
      where.push(`(
        COALESCE(so.so_number, '') ILIKE ${placeholder}
        OR COALESCE(c.name, '') ILIKE ${placeholder}
        OR COALESCE(m.material_name, '') ILIKE ${placeholder}
        OR COALESCE(m.material_code, '') ILIKE ${placeholder}
        OR mb.id::text ILIKE ${placeholder}
      )`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const fromSql = `
      FROM tblmaterial_backorder mb
      LEFT JOIN tblmaterials m ON mb.material_id = m.id
      LEFT JOIN tblsales_order so ON mb.sales_order_id = so.id
      LEFT JOIN tblcustomer c ON so.customer_id = c.id
    `;

    const rowsResult = await this.databaseService.query(
      `SELECT
        mb.id,
        mb.sales_order_id,
        so.so_number,
        c.name AS customer_name,
        mb.material_id,
        m.material_name,
        m.material_code,
        mb.ordered_qty,
        mb.on_hand_qty,
        mb.backorder_qty,
        mb.fulfilled_qty,
        (mb.backorder_qty - COALESCE(mb.fulfilled_qty, 0)) AS remaining_qty,
        mb.status,
        mb.created_at
      ${fromSql}
      ${whereSql}
      ORDER BY mb.created_at DESC, mb.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const countResult = await this.databaseService.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total ${fromSql} ${whereSql}`,
      params,
    );

    const statusCounts = await this.databaseService.query<{
      status: string;
      n: number;
      remaining: string | number;
    }>(
      `SELECT status,
              COUNT(*)::int AS n,
              COALESCE(SUM(backorder_qty - COALESCE(fulfilled_qty, 0)), 0) AS remaining
       FROM tblmaterial_backorder
       GROUP BY status`,
    );

    const counts = {
      pending: 0,
      partialFulfilled: 0,
      fulfilled: 0,
      cancelled: 0,
      open: 0,
      all: 0,
      openRemainingQty: 0,
    };

    for (const row of statusCounts.rows) {
      const n = this.toNumber(row.n);
      const remaining = this.toNumber(row.remaining);
      counts.all += n;
      if (row.status === 'pending') {
        counts.pending = n;
        counts.open += n;
        counts.openRemainingQty += remaining;
      } else if (row.status === 'partial_fulfilled') {
        counts.partialFulfilled = n;
        counts.open += n;
        counts.openRemainingQty += remaining;
      } else if (row.status === 'fulfilled') {
        counts.fulfilled = n;
      } else if (row.status === 'cancelled') {
        counts.cancelled = n;
      }
    }

    const total = this.toNumber(countResult.rows[0]?.total);

    return {
      data: rowsResult.rows.map((row) => this.mapListRow(row)),
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      counts,
    };
  }

  async isRecordingEnabled(): Promise<boolean> {
    await this.ensureRecordingColumn();
    const result = await this.databaseService.query<{ enabled: boolean | null }>(
      `SELECT backorder_recording_enabled AS enabled
       FROM tblsettings
       ORDER BY id ASC
       LIMIT 1`,
    );
    if (!result.rowCount) {
      return true;
    }
    return result.rows[0]?.enabled !== false;
  }

  async setRecordingEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    await this.ensureRecordingColumn();
    const existing = await this.databaseService.query<{ id: number }>(
      `SELECT id FROM tblsettings ORDER BY id ASC LIMIT 1`,
    );
    if (existing.rowCount && existing.rows[0]?.id) {
      await this.databaseService.query(
        `UPDATE tblsettings SET backorder_recording_enabled = $1 WHERE id = $2`,
        [enabled, existing.rows[0].id],
      );
    } else {
      await this.databaseService.query(
        `INSERT INTO tblsettings (backorder_recording_enabled) VALUES ($1)`,
        [enabled],
      );
    }
    return { enabled };
  }

  private async ensureRecordingColumn(): Promise<void> {
    if (this.recordingColumnReady) {
      return;
    }
    await this.databaseService.query(
      `ALTER TABLE tblsettings
       ADD COLUMN IF NOT EXISTS backorder_recording_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
    );
    this.recordingColumnReady = true;
  }

  private normalizeListStatus(status?: string): string {
    const value = String(status ?? 'open').trim().toLowerCase();
    const allowed = new Set([
      'open',
      'pending',
      'partial_fulfilled',
      'fulfilled',
      'cancelled',
      'all',
    ]);
    return allowed.has(value) ? value : 'open';
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private mapListRow(row: Record<string, unknown>) {
    return {
      id: this.toNumber(row['id']),
      salesOrderId: this.toNumber(row['sales_order_id']),
      soNumber: row['so_number'] == null ? '' : String(row['so_number']),
      customerName: row['customer_name'] == null ? '' : String(row['customer_name']),
      materialId: this.toNumber(row['material_id']),
      materialName: row['material_name'] == null ? '' : String(row['material_name']),
      materialCode: row['material_code'] == null ? '' : String(row['material_code']),
      orderedQty: this.toNumber(row['ordered_qty']),
      onHandQty: this.toNumber(row['on_hand_qty']),
      backorderQty: this.toNumber(row['backorder_qty']),
      fulfilledQty: this.toNumber(row['fulfilled_qty']),
      remainingQty: this.toNumber(row['remaining_qty']),
      status: row['status'] == null ? '' : String(row['status']),
      createdAt: row['created_at'] == null ? null : String(row['created_at']),
    };
  }

  /**
   * Apply inbound stock (already posted by a PO receive) to open backorders FIFO.
   * Does not write another IN — the purchase path already increased on_hand_stock.
   * Does write the deferred SO OUT so completed short orders finally deduct.
   */
  async allocateIncomingStockToBackorders(
    materialId: number,
    incomingQty: number,
    options?: {
      userId?: number;
      purchaseId?: number;
      client?: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
    },
  ): Promise<{
    allocatedQty: number;
    allocations: Array<{ backorderId: number; qty: number; status: string }>;
  }> {
    const qty = Number(incomingQty);
    if (!Number.isFinite(materialId) || materialId <= 0 || !Number.isFinite(qty) || qty <= 0) {
      return { allocatedQty: 0, allocations: [] };
    }
    if (!(await this.isRecordingEnabled())) {
      return { allocatedQty: 0, allocations: [] };
    }

    const run = async (client: {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
    }) => {
      const open = await client.query(
        `SELECT id, sales_order_id, backorder_qty, fulfilled_qty
         FROM tblmaterial_backorder
         WHERE material_id = $1
           AND status IN ('pending', 'partial_fulfilled')
         ORDER BY created_at ASC, id ASC
         FOR UPDATE`,
        [materialId],
      );

      let remainingIncoming = qty;
      const allocations: Array<{ backorderId: number; qty: number; status: string }> = [];
      if (open.rowCount === 0 || open.rows.length === 0) {
        return { allocatedQty: 0, allocations };
      }
      const soIds = [
        ...new Set(
          (open.rows as Array<{ sales_order_id: number }>)
            .map((row) => Number(row.sales_order_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ];
      const soNumbers = new Map<number, string>();
      if (soIds.length > 0) {
        const soResult = await client.query(
          `SELECT id, NULLIF(TRIM(COALESCE(
             so_number::text,
             to_jsonb(so)->>'so_number',
             to_jsonb(so)->>'soNumber',
             ''
           )), '') AS so_number
           FROM tblsales_order so
           WHERE id = ANY($1::int[])`,
          [soIds],
        );
        for (const row of soResult.rows as Array<{ id: number; so_number: string | null }>) {
          if (row.so_number) {
            soNumbers.set(Number(row.id), row.so_number);
          }
        }
      }

      let poNumber: string | null = null;
      if (options?.purchaseId) {
        const poResult = await client.query(
          `SELECT NULLIF(TRIM(COALESCE(
             po_number::text,
             to_jsonb(po)->>'po_number',
             to_jsonb(po)->>'poNumber',
             ''
           )), '') AS po_number
           FROM tblpurchase_orders po
           WHERE id = $1`,
          [options.purchaseId],
        );
        poNumber = (poResult?.rows?.[0] as { po_number?: string | null } | undefined)?.po_number ?? null;
      }
      const supplierReference = options?.purchaseId
        ? `PO #${poNumber || options.purchaseId}`
        : null;

      for (const row of open.rows as Array<{
        id: number;
        sales_order_id: number;
        backorder_qty: number;
        fulfilled_qty: number;
      }>) {
        if (remainingIncoming <= 0) {
          break;
        }

        const remainingOnBackorder = Number(row.backorder_qty) - Number(row.fulfilled_qty);
        if (!Number.isFinite(remainingOnBackorder) || remainingOnBackorder <= 0) {
          continue;
        }

        const applyQty = Math.min(remainingIncoming, remainingOnBackorder);
        const nextFulfilled = Number(row.fulfilled_qty) + applyQty;
        const nextStatus = nextFulfilled >= Number(row.backorder_qty) ? 'fulfilled' : 'partial_fulfilled';

        await client.query(
          `UPDATE tblmaterial_backorder
           SET fulfilled_qty = $1,
               status = $2,
               updated_at = NOW(),
               updated_by = $3,
               supplier_reference = COALESCE(NULLIF(supplier_reference, ''), $4)
           WHERE id = $5`,
          [nextFulfilled, nextStatus, options?.userId ?? null, supplierReference, row.id],
        );

        await client.query(
          `UPDATE tblmaterials
           SET on_hand_stock = GREATEST(COALESCE(on_hand_stock, 0) - $1, 0),
               updated_at = NOW()
           WHERE id = $2`,
          [applyQty, materialId],
        );

        await this.materialStockService.recordMovement(
          {
            materialId,
            movementType: 'OUT',
            qty: applyQty,
            sourceType: 'SO',
            sourceId: Number(row.sales_order_id),
            sourceLineKey: `backorder_fulfillment_${row.id}-${options?.purchaseId ?? 'inbound'}`,
            statusSnapshot: 'backorder_fulfillment',
            remarks: `Backorder fulfillment for SO #${
              soNumbers.get(Number(row.sales_order_id)) ?? row.sales_order_id
            }${
              options?.purchaseId ? ` from PO #${poNumber || options.purchaseId}` : ''
            }`,
            createdBy: options?.userId,
          },
          { client },
        );

        allocations.push({ backorderId: Number(row.id), qty: applyQty, status: nextStatus });
        remainingIncoming -= applyQty;
      }

      return { allocatedQty: qty - remainingIncoming, allocations };
    };

    if (options?.client) {
      return run(options.client);
    }

    return this.databaseService.withTransaction((client) => run(client));
  }

  /**
   * Mark open back orders fulfilled without changing stock.
   * Requires the acting user's password. Writes the selected records and remarks to the audit log.
   */
  async manualFulfillBackorders(input: {
    ids: number[];
    remarks: string;
    password: string;
    userId?: number;
    auditActor?: AuditActorContext;
  }): Promise<{ fulfilledCount: number; records: Array<Record<string, unknown>> }> {
    const remarks = String(input.remarks ?? '').trim();
    if (!remarks) {
      throw new BadRequestException('Remarks are required');
    }
    const password = String(input.password ?? '');
    if (!password) {
      throw new BadRequestException('Password is required');
    }
    const userId = Number(input.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BadRequestException('Password is required');
    }

    const ids = [...new Set(
      (input.ids ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    )];
    if (ids.length === 0) {
      throw new BadRequestException('Select at least one back order');
    }
    if (ids.length > 200) {
      throw new BadRequestException('Select 200 back orders or fewer at a time');
    }

    await this.assertUserPassword(userId, password);

    const selected = await this.databaseService.query(
      `SELECT
         mb.id,
         mb.sales_order_id,
         so.so_number,
         c.name AS customer_name,
         mb.material_id,
         m.material_name,
         m.material_code,
         mb.ordered_qty,
         mb.on_hand_qty,
         mb.backorder_qty,
         mb.fulfilled_qty,
         (mb.backorder_qty - COALESCE(mb.fulfilled_qty, 0)) AS remaining_qty,
         mb.status
       FROM tblmaterial_backorder mb
       LEFT JOIN tblmaterials m ON mb.material_id = m.id
       LEFT JOIN tblsales_order so ON mb.sales_order_id = so.id
       LEFT JOIN tblcustomer c ON so.customer_id = c.id
       WHERE mb.id = ANY($1::bigint[])
       ORDER BY mb.id ASC`,
      [ids],
    );

    const openRows = selected.rows.filter((row) => {
      const status = String(row.status ?? '');
      return status === 'pending' || status === 'partial_fulfilled';
    });
    if (openRows.length === 0) {
      throw new BadRequestException('None of the selected back orders can be fulfilled');
    }

    const openIds = openRows.map((row) => Number(row.id));
    const records = openRows.map((row) => this.mapListRow(row as Record<string, unknown>));
    const fulfilledRecords = records.map((record) => ({
      ...record,
      status: 'fulfilled',
      fulfilledQty: record.backorderQty,
      remainingQty: 0,
    }));
    const actor = input.auditActor ?? { userId };
    const description = `Manually fulfilled ${records.length} back order(s)`;

    const updated = await this.databaseService.withTransaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE tblmaterial_backorder
         SET status = 'fulfilled',
             fulfilled_qty = backorder_qty,
             updated_at = NOW(),
             updated_by = $2
         WHERE id = ANY($1::bigint[])
           AND status IN ('pending', 'partial_fulfilled')
         RETURNING id`,
        [openIds, userId],
      );

      await client.query(
        `INSERT INTO tblaudit_logs
           (action, entity_type, entity_id, user_id, username, role_name, branch_id, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          'BACKORDER_MANUAL_FULFILL',
          'backorder',
          'manual-fulfill',
          userId,
          actor.username ?? null,
          actor.roleName ?? null,
          actor.branchId ?? null,
          actor.ipAddress ?? null,
          JSON.stringify({
            description,
            remarks,
            passwordVerified: true,
            selectedBackorders: records,
            requestBody: redactAuditRequestBody({
              ids: openIds,
              remarks,
              password,
            }),
            before: { records },
            after: { status: 'fulfilled', records: fulfilledRecords },
          }),
        ],
      );

      return updateResult;
    });

    return {
      fulfilledCount: updated.rowCount ?? records.length,
      records,
    };
  }

  private async assertUserPassword(userId: number, password: string): Promise<void> {
    const passwordSha1 = createHash('sha1').update(password).digest('hex');
    const result = await this.databaseService.query(
      `SELECT id FROM tblusers WHERE id = $1 AND password = $2 LIMIT 1`,
      [userId, passwordSha1],
    );
    if (!result.rowCount) {
      throw new BadRequestException('Incorrect password');
    }
  }

  /**
   * Fulfill a backorder (partially or fully)
   */
  async fulfillBackorder(
    backorderId: number,
    fulfillQty: number,
    userId?: number,
    auditActor?: AuditActorContext,
  ) {
    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        // Fetch backorder details
        const backorderResult = await client.query(
          `SELECT * FROM tblmaterial_backorder WHERE id = $1`,
          [backorderId],
        );

        if (backorderResult.rowCount === 0) {
          throw new BadRequestException('Backorder not found');
        }

        const backorder = backorderResult.rows[0];

        // Validate fulfillment quantity
        const remainingQty = Number(backorder.backorder_qty) - Number(backorder.fulfilled_qty);
        if (!Number.isFinite(fulfillQty) || fulfillQty <= 0 || fulfillQty > remainingQty) {
          throw new BadRequestException(
            `Invalid fulfillment quantity. Remaining: ${remainingQty}`,
          );
        }

        // Update backorder fulfilled qty and status
        const updateResult = await client.query(
          `UPDATE tblmaterial_backorder
           SET fulfilled_qty = fulfilled_qty + $1,
               status = CASE
                 WHEN fulfilled_qty + $1 >= backorder_qty THEN 'fulfilled'
                 WHEN fulfilled_qty + $1 > 0 THEN 'partial_fulfilled'
                 ELSE status
               END,
               updated_at = NOW(),
               updated_by = $2
           WHERE id = $3
           RETURNING *`,
          [fulfillQty, userId || null, backorderId],
        );

        await this.materialStockService.recordMovement(
          {
            materialId: Number(backorder.material_id),
            movementType: 'IN',
            qty: fulfillQty,
            sourceType: 'SO',
            sourceId: Number(backorder.sales_order_id),
            sourceLineKey: `backorder_fulfillment_${backorderId}-${Date.now()}`,
            statusSnapshot: 'backorder_fulfillment',
            remarks: `Backorder fulfillment: ${fulfillQty} units received`,
            createdBy: userId,
          },
          { client },
        );

        await client.query(
          `UPDATE tblmaterials
           SET on_hand_stock = COALESCE(on_hand_stock, 0) + $1, updated_at = NOW()
           WHERE id = $2`,
          [fulfillQty, backorder.material_id],
        );

        return updateResult.rows[0];
      });

      await this.auditLogService.logMutation({
        action: 'BACKORDER_FULFILL',
        entityType: 'backorder',
        entityId: backorderId,
        actor: auditActor ?? { userId },
        description: `Fulfilled ${fulfillQty} units on backorder #${backorderId}`,
        requestBody: { fulfillQty },
        after: result as Record<string, unknown>,
      });

      return result;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to fulfill backorder',
      );
    }
  }

  /**
   * Cancel a backorder
   */
  async cancelBackorder(
    backorderId: number,
    reason?: string,
    userId?: number,
    auditActor?: AuditActorContext,
  ) {
    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        // Update backorder status to cancelled
        const updateResult = await client.query(
          `UPDATE tblmaterial_backorder
           SET status = 'cancelled',
               cancelled_at = NOW(),
               cancelled_by = $1
           WHERE id = $2 AND status != 'cancelled'
           RETURNING *`,
          [userId || null, backorderId],
        );

        if (updateResult.rowCount === 0) {
          throw new BadRequestException('Backorder not found or already cancelled');
        }

        return updateResult.rows[0];
      });

      await this.auditLogService.logMutation({
        action: 'BACKORDER_CANCEL',
        entityType: 'backorder',
        entityId: backorderId,
        actor: auditActor ?? { userId },
        description: `Cancelled backorder #${backorderId}`,
        requestBody: { reason: reason ?? null },
        after: result as Record<string, unknown>,
      });

      return result;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to cancel backorder',
      );
    }
  }

  async cancelOpenBackordersForSalesOrder(salesOrderId: number, userId?: number): Promise<number> {
    const result = await this.databaseService.query(
      `UPDATE tblmaterial_backorder
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = $1
       WHERE sales_order_id = $2
         AND status IN ('pending', 'partial_fulfilled')`,
      [userId || null, salesOrderId],
    );
    return result.rowCount ?? 0;
  }
}
