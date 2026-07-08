import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { DatabaseService } from 'src/database/database.service';
import { PurchaseTabItemDto } from './dto/purchase-tab-item.dto';
import { ListPurchaseQueryDto } from './dto/list-purchase-query.dto';
import { PurchaseListResponseDto } from './dto/purchase-list-response.dto';
import { PoolClient } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { AuditActorContext, AuditLogService } from 'src/audit-log/audit-log.service';

type PurchaseRow = {
  id: number;
  poNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorAddress: string | null;
  vendorContactPerson: string | null;
  vendorContactNumber: string | null;
  totalAmount: string | null;
  status: string | null;
  paymentDetails: unknown;
  productItems: unknown;
  createdAt: string | null;
  serialCount: number;
};

type PurchaseCountRow = {
  total: string;
};

type PurchaseMode = 'deliveries' | 'approvals' | 'master-data';
type PurchasePaymentMethod =
  | 'Cash'
  | 'Bank Transfer'
  | 'Terms'
  | 'Terms with DP'
  | 'Cheque'
  | 'Credit Card'
  | 'Installment';
type TableColumnMeta = {
  column_name: string;
  data_type: string;
  udt_name: string;
};

type PurchaseDetailRow = {
  id: number;
  poNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorAddress: string | null;
  vendorContactPerson: string | null;
  vendorContactNumber: string | null;
  totalAmount: string | null;
  status: string | null;
  poType?: string | null;
  createdAt: string | null;
};

type PurchasePaymentRow = {
  method: string | null;
  amount: string | null;
  terms: string | null;
  termsDueDate: string | null;
  status: string | null;
  paymentDate: string | null;
  bankName: string | null;
  referenceNo: string | null;
  checkNo: string | null;
  chequeDate: string | null;
  issuedBy: string | null;
  downPayment: string | null;
};

type PurchaseProductRow = {
  id: number;
  transType: string | null;
  productId: string | null;
  capacityId: string | null;
  unitPrice: string | null;
  sellPrice: string | null;
  discountPrice: string | null;
  unitTypesQty: unknown;
  totalSetQty: string | null;
  purchaseId: string | null;
  salesId: string | null;
  status: string | null;
  partsName?: string | null;
  partsCode?: string | null;
  partsModel?: string | null;
  partsBrandId?: string | null;
  partsBrandName?: string | null;
  materialName?: string | null;
  materialCode?: string | null;
  materialUnit?: string | null;
  materialBrandId?: string | null;
  materialBrandName?: string | null;
};

type PurchaseSerialRow = {
  serialNumber: string | null;
  status?: string | null;
  productId: string | null;
  capacityId: string | null;
  unitType: string | null;
};

type CapacityPriceUpdateColumns = {
  idColumn: string;
  productIdColumn?: string;
  netPriceColumn: string;
};

@Injectable()
export class PurchaseService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly materialStockService: MaterialStockService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit() {
    try {
      await this.databaseService.query(`
        ALTER TABLE tblpurchase_orders DROP CONSTRAINT IF EXISTS tblpurchase_orders_po_type_check;
        ALTER TABLE tblpurchase_orders ADD CONSTRAINT tblpurchase_orders_po_type_check 
        CHECK (po_type IN ('ACU', 'ACP', 'ACM', 'PO', 'PO_TYPE_ACU', 'PO_TYPE_ACP', 'PO_TYPE_ACM'));

        -- Ensure capacity is nullable for parts/materials support (handle both legacy naming styles)
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name='tbltransaction_product_items'
                  AND column_name='capacity_id'
            ) THEN
                ALTER TABLE tbltransaction_product_items ALTER COLUMN capacity_id DROP NOT NULL;
            ELSIF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name='tbltransaction_product_items'
                  AND column_name='capacityId'
            ) THEN
                ALTER TABLE tbltransaction_product_items ALTER COLUMN "capacityId" DROP NOT NULL;
            END IF;
        END $$;

        -- Create tbltransaction_parts_items if it doesn't exist
        CREATE TABLE IF NOT EXISTS tbltransaction_parts_items (
          id SERIAL PRIMARY KEY,
          trans_type VARCHAR(50),
          part_id INT,
          quantity INT,
          unit_price NUMERIC,
          sell_price NUMERIC,
          discount_price NUMERIC,
          purchase_id INT,
          sales_id INT,
          status VARCHAR(50) DEFAULT 'pending',
          unit_types_qty JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Ensure tbltransaction_material_items has unit_types_qty and status
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tbltransaction_material_items' AND column_name='unit_types_qty') THEN
                ALTER TABLE tbltransaction_material_items ADD COLUMN unit_types_qty JSONB DEFAULT '[]'::jsonb;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tbltransaction_material_items' AND column_name='status') THEN
                ALTER TABLE tbltransaction_material_items ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
            END IF;
        END $$;
      `);
      console.log('Successfully updated tblpurchase_orders_po_type_check constraint.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to update tblpurchase_orders_po_type_check constraint:', errorMessage);
    }
  }

  private async getPurchaseAuditSnapshot(id: number): Promise<Record<string, unknown> | null> {
    const purchaseResult = await this.databaseService.query<{
      id: number;
      poNumber: string | null;
      vendorId: string | null;
      vendorName: string | null;
      totalAmount: string | null;
      status: string | null;
      branchId: string | null;
      createdAt: string | null;
    }>(
      `SELECT
         po.id,
         COALESCE(to_jsonb(po)->>'po_number', to_jsonb(po)->>'poNumber', '') AS "poNumber",
         COALESCE(to_jsonb(po)->>'vendor_id', to_jsonb(po)->>'vendorId', '') AS "vendorId",
         COALESCE(to_jsonb(v)->>'name', to_jsonb(v)->>'vendor_name', '') AS "vendorName",
         COALESCE(to_jsonb(po)->>'total_amount', to_jsonb(po)->>'totalAmount', '0') AS "totalAmount",
         COALESCE(to_jsonb(po)->>'status', 'pending') AS status,
         COALESCE(to_jsonb(po)->>'branchId', to_jsonb(po)->>'branch_id', null) AS "branchId",
         COALESCE(to_jsonb(po)->>'created_at', to_jsonb(po)->>'createdAt', null) AS "createdAt"
       FROM tblpurchase_orders po
       LEFT JOIN tblvendors v
         ON v.id::text = COALESCE(to_jsonb(po)->>'vendor_id', to_jsonb(po)->>'vendorId', '')
       WHERE po.id = $1
       LIMIT 1`,
      [id],
    );

    if (purchaseResult.rowCount === 0) {
      return null;
    }

    const paymentsResult = await this.databaseService.query<Record<string, unknown>>(
      `SELECT to_jsonb(pp) AS row
       FROM tblpo_payments pp
       WHERE COALESCE(
         to_jsonb(pp)->>'po_id',
         to_jsonb(pp)->>'poId',
         to_jsonb(pp)->>'purchase_id',
         to_jsonb(pp)->>'purchaseId',
         to_jsonb(pp)->>'purchase_order_id',
         to_jsonb(pp)->>'purchaseOrderId'
       ) = $1
       ORDER BY pp.id ASC`,
      [String(id)],
    );

    const poRes = await this.databaseService.query(
      `SELECT COALESCE(
         po.po_type,
         to_jsonb(po)->>'poType',
         to_jsonb(po)->>'po_type',
         'ACU'
       ) AS po_type
       FROM tblpurchase_orders po
       WHERE po.id = $1`,
      [id],
    );
    const poType = this.normalizePoType(poRes.rows[0]?.po_type);
    let itemsTable = 'tbltransaction_product_items';
    if (poType === 'ACP') itemsTable = 'tbltransaction_parts_items';
    else if (poType === 'ACM') itemsTable = 'tbltransaction_material_items';

    const itemsResult = await this.databaseService.query<Record<string, unknown>>(
      `SELECT to_jsonb(tpi) AS row
       FROM ${itemsTable} tpi
       WHERE COALESCE(
         to_jsonb(tpi)->>'purchaseId',
         to_jsonb(tpi)->>'purchase_id',
         to_jsonb(tpi)->>'po_id'
       ) = $1
       AND LOWER(COALESCE(to_jsonb(tpi)->>'transType', to_jsonb(tpi)->>'trans_type', 'purchase')) = 'purchase'
       ORDER BY tpi.id ASC`,
      [String(id)],
    );

    const purchase = purchaseResult.rows[0];
    return {
      purchaseOrderId: purchase.id,
      poNumber: purchase.poNumber,
      vendorId: purchase.vendorId,
      vendorName: purchase.vendorName,
      totalAmount: this.toOptionalNumber(purchase.totalAmount) ?? 0,
      status: purchase.status,
      branchId: this.toOptionalNumber(purchase.branchId),
      createdAt: purchase.createdAt,
      paymentDetails: paymentsResult.rows.map((row) => row.row),
      productItems: itemsResult.rows.map((row) => row.row),
    };
  }

  private resolvePurchaseUpdateAuditAction(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): { action: string; description: string } {
    const beforeStatus = String(before?.status ?? '').trim().toLowerCase();
    const afterStatus = String(after?.status ?? '').trim().toLowerCase();
    const poNumber = String(after?.poNumber ?? before?.poNumber ?? '').trim();
    const purchaseLabel = poNumber || `#${String(after?.purchaseOrderId ?? before?.purchaseOrderId ?? '')}`;

    if (
      !['for_approval', 'for approval', 'approval', 'pending_approval', 'pending approval'].includes(beforeStatus) &&
      ['for_approval', 'for approval', 'approval', 'pending_approval', 'pending approval'].includes(afterStatus)
    ) {
      return {
        action: 'PURCHASE_SEND_FOR_APPROVAL',
        description: `Sent purchase order ${purchaseLabel} for approval`,
      };
    }

    return {
      action: 'PURCHASE_UPDATE',
      description: `Updated purchase order ${purchaseLabel}`,
    };
  }

  private async getTableColumns(
    executor: { query: PoolClient['query'] },
    tableName: string,
  ): Promise<string[]> {
    const columnsResult = await executor.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );

    return columnsResult.rows.map((row) => row.column_name);
  }

  private async getColumnMeta(
    executor: { query: PoolClient['query'] },
    tableName: string,
    columnName: string,
  ): Promise<TableColumnMeta | null> {
    const result = await executor.query<TableColumnMeta>(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = $1
         AND LOWER(column_name) = LOWER($2)
       LIMIT 1`,
      [tableName, columnName],
    );

    return result.rows[0] ?? null;
  }

  private pickColumn(
    availableColumns: string[],
    candidates: string[],
  ): string | undefined {
    const availableColumnsLower = new Set(
      availableColumns.map((column) => column.toLowerCase()),
    );

    return candidates.find((candidate) =>
      availableColumnsLower.has(candidate.toLowerCase()),
    );
  }

  private async findVendorIdByName(
    executor: { query: PoolClient['query'] },
    vendorName: string,
  ): Promise<string | null> {
    const normalizedVendorName = String(vendorName ?? '').trim();
    if (!normalizedVendorName) {
      return null;
    }

    const existingVendorResult = await executor.query<{ id: string }>(
      `SELECT v.id::text AS id
       FROM tblvendors v
       WHERE LOWER(TRIM(COALESCE(to_jsonb(v)->>'name', to_jsonb(v)->>'vendor_name', ''))) = LOWER(TRIM($1))
       LIMIT 1`,
      [normalizedVendorName],
    );

    return existingVendorResult.rows[0]?.id ? String(existingVendorResult.rows[0].id) : null;
  }

  // private async updateVendorRecord(
  //   executor: { query: PoolClient['query'] },
  //   vendorId: string,
  //   vendorColumns: string[],
  //   input: {
  //     name?: string;
  //     address?: string;
  //     contactPerson?: string;
  //     contactNumber?: string;
  //   },
  // ): Promise<void> {
  //   const vendorNameColumn = this.pickColumn(vendorColumns, ['name', 'vendor_name']);
  //   const vendorAddressColumn = this.pickColumn(vendorColumns, ['address']);
  //   const contactPersonColumn = this.pickColumn(vendorColumns, ['contact_person', 'contactPerson']);
  //   const contactNumberColumn = this.pickColumn(vendorColumns, ['contact_number', 'contactNumber']);
  //   const updatedAtColumn = this.pickColumn(vendorColumns, ['updated_at', 'updatedAt']);

  //   const updates: string[] = [];
  //   const params: unknown[] = [];

  //   const vendorName = String(input.name ?? '').trim();
  //   const vendorAddress = String(input.address ?? '').trim();
  //   const contactPerson = String(input.contactPerson ?? '').trim();
  //   const contactNumber = String(input.contactNumber ?? '').trim();

  //   if (vendorNameColumn && vendorName) {
  //     params.push(vendorName);
  //     updates.push(`"${vendorNameColumn}" = $${params.length}`);
  //   }
  //   if (vendorAddressColumn && vendorAddress) {
  //     params.push(vendorAddress);
  //     updates.push(`"${vendorAddressColumn}" = $${params.length}`);
  //   }
  //   if (contactPersonColumn && contactPerson) {
  //     params.push(contactPerson);
  //     updates.push(`"${contactPersonColumn}" = $${params.length}`);
  //   }
  //   if (contactNumberColumn && contactNumber) {
  //     params.push(contactNumber);
  //     updates.push(`"${contactNumberColumn}" = $${params.length}`);
  //   }
  //   if (updatedAtColumn) {
  //     params.push(new Date().toISOString());
  //     updates.push(`"${updatedAtColumn}" = $${params.length}`);
  //   }

  //   if (updates.length === 0) {
  //     return;
  //   }

  //   params.push(vendorId);
  //   await executor.query(
  //     `UPDATE tblvendors
  //      SET ${updates.join(', ')}
  //      WHERE id::text = $${params.length}`,
  //     params,
  //   );
  // }

  // private async resolvePurchaseVendor(
  //   executor: { query: PoolClient['query'] },
  //   vendorColumns: string[],
  //   input: {
  //     vendorId?: string | null;
  //     vendorName?: string;
  //     vendorAddress?: string;
  //     contactPerson?: string;
  //     contactNumber?: string;
  //   },
  // ): Promise<string> {
  //   const vendorIdColumn = this.pickColumn(vendorColumns, ['id']);
  //   const vendorNameColumn = this.pickColumn(vendorColumns, ['name', 'vendor_name']);
  //   const createdAtColumn = this.pickColumn(vendorColumns, ['created_at', 'createdAt']);
  //   const updatedAtColumn = this.pickColumn(vendorColumns, ['updated_at', 'updatedAt']);

  //   let resolvedVendorId = String(input.vendorId ?? '').trim();
  //   const vendorName = String(input.vendorName ?? '').trim();
  //   const vendorAddress = String(input.vendorAddress ?? '').trim();
  //   const contactPerson = String(input.contactPerson ?? '').trim();
  //   const contactNumber = String(input.contactNumber ?? '').trim();

  //   if (resolvedVendorId) {
  //     const existingVendorResult = await executor.query<{ id: string }>(
  //       `SELECT id::text AS id
  //        FROM tblvendors
  //        WHERE id::text = $1
  //        LIMIT 1`,
  //       [resolvedVendorId],
  //     );

  //     if (existingVendorResult.rowCount > 0) {
  //       await this.updateVendorRecord(executor, resolvedVendorId, vendorColumns, {
  //         name: vendorName,
  //         address: vendorAddress,
  //         contactPerson,
  //         contactNumber,
  //       });
  //       return resolvedVendorId;
  //     }
  //   }

  //   if (!vendorName) {
  //     throw new Error('Vendor ID or vendor.name is required');
  //   }

  //   const matchedVendorId = await this.findVendorIdByName(executor, vendorName);
  //   if (matchedVendorId) {
  //     await this.updateVendorRecord(executor, matchedVendorId, vendorColumns, {
  //       name: vendorName,
  //       address: vendorAddress,
  //       contactPerson,
  //       contactNumber,
  //     });
  //     return matchedVendorId;
  //   }

  //   if (!vendorNameColumn) {
  //     throw new Error('tblvendors name column is missing');
  //   }

  //   const vendorRecord: Record<string, unknown> = {
  //     [vendorNameColumn]: vendorName,
  //   };

  //   if (vendorIdColumn) {
  //     vendorRecord[vendorIdColumn] = resolvedVendorId || randomUUID();
  //   }
  //   const vendorAddressColumn = this.pickColumn(vendorColumns, ['address']);
  //   const contactPersonColumn = this.pickColumn(vendorColumns, ['contact_person', 'contactPerson']);
  //   const contactNumberColumn = this.pickColumn(vendorColumns, ['contact_number', 'contactNumber']);

  //   if (vendorAddressColumn && vendorAddress) {
  //     vendorRecord[vendorAddressColumn] = vendorAddress;
  //   }
  //   if (contactPersonColumn && contactPerson) {
  //     vendorRecord[contactPersonColumn] = contactPerson;
  //   }
  //   if (contactNumberColumn && contactNumber) {
  //     vendorRecord[contactNumberColumn] = contactNumber;
  //   }
  //   if (createdAtColumn) {
  //     vendorRecord[createdAtColumn] = new Date().toISOString();
  //   }
  //   if (updatedAtColumn) {
  //     vendorRecord[updatedAtColumn] = new Date().toISOString();
  //   }

  //   const insertedVendor = await this.runInsert(executor, 'tblvendors', vendorRecord);
  //   if (insertedVendor.rowCount === 0) {
  //     throw new Error('Failed to create vendor');
  //   }

  //   return String(insertedVendor.rows[0].id);
  // }

  private async updateVendorRecord(
    executor: { query: PoolClient['query'] },
    vendorId: string,
    vendorColumns: string[],
    input: {
      name?: string;
      address?: string;
      contactPerson?: string;
      contactNumber?: string;
    },
  ): Promise<void> {
    const vendorNameColumn = this.pickColumn(vendorColumns, ['name', 'vendor_name']);
    const vendorAddressColumn = this.pickColumn(vendorColumns, ['address']);
    const contactPersonColumn = this.pickColumn(vendorColumns, ['contact_person', 'contactPerson']);
    const contactNumberColumn = this.pickColumn(vendorColumns, ['contact_number', 'contactNumber']);
    const updatedAtColumn = this.pickColumn(vendorColumns, ['updated_at', 'updatedAt']);

    const updates: string[] = [];
    const params: unknown[] = [];

    // Use undefined checks so explicit empty values ('') can be saved/cleared
    if (vendorNameColumn && input.name !== undefined) {
      params.push(String(input.name ?? '').trim());
      updates.push(`"${vendorNameColumn}" = $${params.length}`);
    }
    if (vendorAddressColumn && input.address !== undefined) {
      params.push(String(input.address ?? '').trim());
      updates.push(`"${vendorAddressColumn}" = $${params.length}`);
    }
    if (contactPersonColumn && input.contactPerson !== undefined) {
      params.push(String(input.contactPerson ?? '').trim());
      updates.push(`"${contactPersonColumn}" = $${params.length}`);
    }
    if (contactNumberColumn && input.contactNumber !== undefined) {
      params.push(String(input.contactNumber ?? '').trim());
      updates.push(`"${contactNumberColumn}" = $${params.length}`);
    }
    if (updatedAtColumn) {
      params.push(new Date().toISOString());
      updates.push(`"${updatedAtColumn}" = $${params.length}`);
    }

    if (updates.length === 0) {
      return;
    }

    params.push(vendorId);
    await executor.query(
      `UPDATE tblvendors
      SET ${updates.join(', ')}
      WHERE id::text = $${params.length}`,
      params,
    );
  }

  private async resolvePurchaseVendor(
    executor: { query: PoolClient['query'] },
    vendorColumns: string[],
    input: {
      vendorId?: string | null;
      vendorName?: string;
      vendorAddress?: string;
      contactPerson?: string;
      contactNumber?: string;
    },
  ): Promise<string> {
    const vendorIdColumn = this.pickColumn(vendorColumns, ['id']);
    const vendorNameColumn = this.pickColumn(vendorColumns, ['name', 'vendor_name']);
    const createdAtColumn = this.pickColumn(vendorColumns, ['created_at', 'createdAt']);
    const updatedAtColumn = this.pickColumn(vendorColumns, ['updated_at', 'updatedAt']);

    let resolvedVendorId = String(input.vendorId ?? '').trim();
    const vendorName = String(input.vendorName ?? '').trim();
    const vendorAddress = String(input.vendorAddress ?? '').trim();
    const contactPerson = String(input.contactPerson ?? '').trim();
    const contactNumber = String(input.contactNumber ?? '').trim();

    if (resolvedVendorId) {
      const existingVendorResult = await executor.query<{ id: string }>(
        `SELECT id::text AS id FROM tblvendors WHERE id::text = $1 LIMIT 1`,
        [resolvedVendorId],
      );

      if (existingVendorResult.rowCount > 0) {
        await this.updateVendorRecord(executor, resolvedVendorId, vendorColumns, {
          name: vendorName || undefined,
          address: input.vendorAddress,
          contactPerson: input.contactPerson,
          contactNumber: input.contactNumber,
        });
        return resolvedVendorId;
      }
    }

    if (!vendorName) {
      throw new Error('Vendor ID or vendor.name is required');
    }

    const matchedVendorId = await this.findVendorIdByName(executor, vendorName);
    if (matchedVendorId) {
      await this.updateVendorRecord(executor, matchedVendorId, vendorColumns, {
        name: vendorName,
        address: input.vendorAddress,
        contactPerson: input.contactPerson,
        contactNumber: input.contactNumber,
      });
      return matchedVendorId;
    }

    if (!vendorNameColumn) {
      throw new Error('tblvendors name column is missing');
    }

    const vendorRecord: Record<string, unknown> = {
      [vendorNameColumn]: vendorName,
    };

    if (vendorIdColumn) {
      vendorRecord[vendorIdColumn] = resolvedVendorId || randomUUID();
    }
    const vendorAddressColumn = this.pickColumn(vendorColumns, ['address']);
    const contactPersonColumn = this.pickColumn(vendorColumns, ['contact_person', 'contactPerson']);
    const contactNumberColumn = this.pickColumn(vendorColumns, ['contact_number', 'contactNumber']);

    if (vendorAddressColumn) vendorRecord[vendorAddressColumn] = vendorAddress;
    if (contactPersonColumn) vendorRecord[contactPersonColumn] = contactPerson;
    if (contactNumberColumn) vendorRecord[contactNumberColumn] = contactNumber;
    if (createdAtColumn) vendorRecord[createdAtColumn] = new Date().toISOString();
    if (updatedAtColumn) vendorRecord[updatedAtColumn] = new Date().toISOString();

    const insertedVendor = await this.runInsert(executor, 'tblvendors', vendorRecord);
    if (insertedVendor.rowCount === 0) {
      throw new Error('Failed to create vendor');
    }

    return String(insertedVendor.rows[0].id);
  }

  private async runInsert(
    executor: { query: PoolClient['query'] },
    tableName: string,
    record: Record<string, unknown>,
  ) {
    const columns = Object.keys(record);
    const values = Object.values(record);
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

    return executor.query<{ id: number }>(
      `INSERT INTO ${tableName} (${quotedColumns}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
  }

  private toRequiredNumber(value: unknown, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${fieldName} must be a valid number`);
    }

    return parsed;
  }

  private normalizePoType(value: unknown): 'ACU' | 'ACP' | 'ACM' {
    const raw = String(value ?? '').trim().toUpperCase();
    if (raw === 'ACP' || raw === 'PO_TYPE_ACP') return 'ACP';
    if (raw === 'ACM' || raw === 'PO_TYPE_ACM' || raw === 'MATERIAL') return 'ACM';
    return 'ACU';
  }

  /**
   * Validates ACM product items before processing.
   * - Material name is required
   * - Quantity must be between 1 and 999999
   */
  private validateAcmProductItems(
    productItems: Array<Record<string, unknown>>,
  ): void {
    for (const [index, item] of productItems.entries()) {
      const transType = String(item.transType ?? item.trans_type ?? 'purchase').trim().toLowerCase();
      if (transType !== 'purchase') {
        continue;
      }

      const materialId = this.toOptionalNumber(item.materialId ?? item.productId);
      const materialName = String(item.materialName ?? '').trim();

      // Material name is required when no materialId is provided
      if (!materialId && !materialName) {
        throw new BadRequestException(
          `productItems[${index}]: Material name is required for ACM items`,
        );
      }

      // Unit price validation: must be between 0.01 and 999999.99
      const unitPrice = this.toOptionalNumber(item.unitPrice);
      if (unitPrice !== null && (unitPrice < 0.01 || unitPrice > 999999.99)) {
        throw new BadRequestException(
          `productItems[${index}].unitPrice: Unit price must be between 0.01 and 999,999.99`,
        );
      }

      // Discount price validation: must be between 0 and 999999.99
      const discountPrice = this.toOptionalNumber(item.discountPrice);
      if (discountPrice !== null && (discountPrice < 0 || discountPrice > 999999.99)) {
        throw new BadRequestException(
          `productItems[${index}].discountPrice: Discount price must be between 0 and 999,999.99`,
        );
      }

      // Quantity validation: must be between 1 and 999999
      const quantity = this.toOptionalNumber(item.totalSetQty ?? item.quantity);
      const unitTypesQty = Array.isArray(item.unitTypesQty) ? item.unitTypesQty : [];
      const qtyFromList = unitTypesQty.reduce((sum: number, current: any) => {
        const parsedQty = this.toOptionalNumber(current.qty ?? current.value) ?? 0;
        return sum + (parsedQty > 0 ? parsedQty : 0);
      }, 0);
      const effectiveQty = qtyFromList > 0 ? qtyFromList : (quantity ?? 0);

      if (effectiveQty < 1 || effectiveQty > 999999) {
        throw new BadRequestException(
          `productItems[${index}].totalSetQty: Quantity must be between 1 and 999,999`,
        );
      }

      if (!Number.isInteger(effectiveQty)) {
        throw new BadRequestException(
          `productItems[${index}].totalSetQty: Quantity must be a whole number`,
        );
      }
    }
  }

  private toOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toIsoDateOrNull(value: unknown): string | null {
    if (!value) {
      return null;
    }

    const raw = String(value).trim();

    const ddMmYyyyMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (ddMmYyyyMatch) {
      const day = Number(ddMmYyyyMatch[1]);
      const month = Number(ddMmYyyyMatch[2]);
      const year = Number(ddMmYyyyMatch[3]);
      const parsed = new Date(Date.UTC(year, month - 1, day));

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  private normalizeSerialNumber(value: unknown): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private toPurchasePaymentMethod(value: unknown): PurchasePaymentMethod {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();

    if (normalized === 'cash') return 'Cash';
    if (normalized === 'bank transfer' || normalized === 'bank_transfer') return 'Bank Transfer';
    if (normalized === 'terms') return 'Terms';
    if (normalized === 'terms with dp' || normalized === 'terms_with_dp') return 'Terms with DP';
    if (normalized === 'cheque' || normalized === 'check') return 'Cheque';
    if (normalized === 'credit card' || normalized === 'credit_card') return 'Credit Card';
    if (normalized === 'installment') return 'Installment';

    throw new BadRequestException(`Invalid payment method: ${String(value ?? '')}`);
  }

  private hasPaymentValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return false;
      }

      return value !== 0;
    }

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    return true;
  }

  private getAutoPaymentStatus(method: PurchasePaymentMethod): string {
    if (method === 'Cash' || method === 'Bank Transfer') {
      return 'paid';
    }

    return 'unpaid';
  }

  private toPositiveIntegerOrNull(value: unknown): number | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }

    const parsed = Number(raw.match(/\d+/)?.[0] ?? Number.NaN);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return Math.floor(parsed);
  }

  private deriveTermsDueDate(
    paymentDetails: Record<string, unknown>,
    method: PurchasePaymentMethod,
  ): string | null {
    const explicitDueDate = this.toIsoDateOrNull(paymentDetails.termsDueDate);
    if (explicitDueDate) {
      return explicitDueDate;
    }

    if (method !== 'Terms' && method !== 'Terms with DP') {
      return null;
    }

    const termDays = this.toPositiveIntegerOrNull(paymentDetails.terms);
    if (!termDays) {
      return null;
    }

    const baseDateIso = this.toIsoDateOrNull(paymentDetails.paymentDate) ?? new Date().toISOString();
    const baseDate = new Date(baseDateIso);
    if (Number.isNaN(baseDate.getTime())) {
      return null;
    }

    baseDate.setUTCHours(0, 0, 0, 0);
    baseDate.setUTCDate(baseDate.getUTCDate() + termDays);

    return baseDate.toISOString();
  }

  private resolvePaymentStatusForDisplay(
    methodValue: unknown,
    statusValue: unknown,
    termsDueDateValue: unknown,
    chequeDateValue: unknown,
  ): string {
    const normalizedStatus = String(statusValue ?? '').trim().toLowerCase();
    if (normalizedStatus === 'paid') {
      return 'paid';
    }

    let method: PurchasePaymentMethod | null = null;
    try {
      method = this.toPurchasePaymentMethod(methodValue);
    } catch {
      method = null;
    }

    if (method === 'Terms' || method === 'Terms with DP' || method === 'Cheque') {
      const dueSource = method === 'Cheque' ? chequeDateValue : termsDueDateValue;
      const dueDateIso = this.toIsoDateOrNull(dueSource);
      if (dueDateIso) {
        const dueDate = new Date(dueDateIso);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (!Number.isNaN(dueDate.getTime()) && dueDate < today) {
          return 'overdue';
        }
      }
    }

    return 'unpaid';
  }

  private validatePurchasePaymentDetails(
    paymentDetails: Record<string, unknown>,
    index: number,
  ): PurchasePaymentMethod {
    const method = this.toPurchasePaymentMethod(paymentDetails.method);

    const allowedFieldsByMethod: Record<PurchasePaymentMethod, Set<string>> = {
      Cash: new Set(['amount', 'paymentDate']),
      'Bank Transfer': new Set(['amount', 'bankName', 'referenceNo']),
      Terms: new Set(['amount', 'terms', 'termsDueDate']),
      'Terms with DP': new Set(['amount', 'terms', 'termsDueDate', 'downPayment']),
      Cheque: new Set(['amount', 'bankName', 'checkNo', 'chequeDate', 'issuedBy']),
      'Credit Card': new Set(['amount', 'paymentDate']),
      Installment: new Set(['amount', 'terms', 'termsDueDate', 'downPayment']),
    };

    const optionalFields = [
      'terms',
      'termsDueDate',
      'paymentDate',
      'bankName',
      'referenceNo',
      'checkNo',
      'chequeDate',
      'issuedBy',
      'downPayment',
    ] as const;

    const disallowedFields = optionalFields.filter(
      (field) =>
        this.hasPaymentValue(paymentDetails[field]) && !allowedFieldsByMethod[method].has(field),
    );

    if (disallowedFields.length > 0) {
      throw new BadRequestException(
        `paymentDetails[${index}] has invalid field(s) for method ${method}: ${disallowedFields.join(', ')}`,
      );
    }

    return method;
  }

  private toComparableNumberString(value: unknown): string {
    const parsed = this.toOptionalNumber(value);
    if (parsed === null) {
      return '0';
    }

    return String(parsed);
  }

  private async resolveCapacityNetPriceTable(
    executor: { query: PoolClient['query'] },
  ): Promise<{ tableName: string; columns: string[] } | null> {
    const candidateTables = ['tblcapacity_netprice_history', 'tblcapacity_netprice'];

    for (const tableName of candidateTables) {
      const columns = await this.getTableColumns(executor, tableName);
      if (columns.length > 0) {
        return { tableName, columns };
      }
    }

    return null;
  }

  private async getCapacityLabelById(
    executor: { query: PoolClient['query'] },
    capacityId: number,
  ): Promise<string> {
    const result = await executor.query<{ capacity_label: string | null }>(
      `SELECT COALESCE(
         to_jsonb(c)->>'capacity',
         to_jsonb(c)->>'capacityValue',
         to_jsonb(c)->>'capacity_value'
       ) AS capacity_label
       FROM tblcapacity c
       WHERE c.id::text = $1
       LIMIT 1`,
      [String(capacityId)],
    );

    const label = String(result.rows[0]?.capacity_label ?? '').trim();
    return label || String(capacityId);
  }

  private async recordCapacityNetPriceFromPurchaseItem(
    executor: { query: PoolClient['query'] },
    input: {
      productId: number;
      capacityId: number;
      unitPrice: unknown;
      vendorId?: string | null;
      purchaseOrderId: number;
      purchaseOrderNo?: string | null;
      userId?: number;
    },
  ): Promise<void> {
    const tableMeta = await this.resolveCapacityNetPriceTable(executor);
    if (!tableMeta) {
      return;
    }

    const { tableName, columns } = tableMeta;

    const productIdColumn = this.pickColumn(columns, [
      'prodId',
      'productId',
      'prod_id',
      'product_id',
    ]);
    const capacityColumn = this.pickColumn(columns, [
      'capacity',
      'capacityValue',
      'capacity_value',
    ]);
    const netPriceColumn = this.pickColumn(columns, ['netPrice', 'net_price']);
    const supplierIdColumn = this.pickColumn(columns, ['supplierId', 'supplier_id']);
    const purchaseOrderIdColumn = this.pickColumn(columns, [
      'purchaseOrderId',
      'purchase_order_id',
      'poId',
      'po_id',
    ]);
    const purchaseOrderNoColumn = this.pickColumn(columns, [
      'purchaseOrderNo',
      'purchase_order_no',
      'poNo',
      'po_no',
    ]);
    const createdByColumn = this.pickColumn(columns, [
      'created_by',
      'createdBy',
      'createdby',
    ]);

    if (!productIdColumn || !capacityColumn || !netPriceColumn) {
      return;
    }

    const capacityLabel = await this.getCapacityLabelById(executor, input.capacityId);
    const normalizedNetPrice = this.toOptionalNumber(input.unitPrice) ?? 0;
    const shouldApplyNetPrice = await this.applyApprovedCapacityUnitPriceIfEligible(
      executor,
      input.productId,
      input.capacityId,
      normalizedNetPrice,
    );
    if (!shouldApplyNetPrice) {
      return;
    }

    const normalizedSupplierId = this.toOptionalNumber(input.vendorId);
    const normalizedPoNo = String(input.purchaseOrderNo ?? '').trim();

    const latestNetPriceResult = await executor.query<{ net_price_value: string | null }>(
      `SELECT "${netPriceColumn}"::text AS net_price_value
       FROM ${tableName}
       WHERE "${productIdColumn}"::text = $1::text
         AND LOWER(TRIM("${capacityColumn}"::text)) = LOWER(TRIM($2::text))
       ORDER BY id DESC
       LIMIT 1`,
      [input.productId, capacityLabel],
    );

    const latestComparable = this.toComparableNumberString(
      latestNetPriceResult.rows[0]?.net_price_value,
    );
    const incomingComparable = this.toComparableNumberString(normalizedNetPrice);

    if (latestComparable === incomingComparable) {
      return;
    }

    const historyRecord: Record<string, unknown> = {
      [productIdColumn]: input.productId,
      [capacityColumn]: capacityLabel,
      [netPriceColumn]: normalizedNetPrice,
    };

    if (supplierIdColumn && normalizedSupplierId !== null) {
      historyRecord[supplierIdColumn] = normalizedSupplierId;
    }
    if (purchaseOrderIdColumn) {
      historyRecord[purchaseOrderIdColumn] = input.purchaseOrderId;
    }
    if (purchaseOrderNoColumn && normalizedPoNo) {
      historyRecord[purchaseOrderNoColumn] = normalizedPoNo;
    }
    if (createdByColumn && input.userId) {
      historyRecord[createdByColumn] = input.userId;
    }

    await this.runInsert(executor, tableName, historyRecord);
  }

  private async resolveCapacityPriceUpdateColumns(
    executor: { query: PoolClient['query'] },
  ): Promise<CapacityPriceUpdateColumns | null> {
    const capacityColumns = await this.getTableColumns(executor, 'tblcapacity');
    if (capacityColumns.length === 0) {
      return null;
    }

    const idColumn = this.pickColumn(capacityColumns, ['id']);
    const productIdColumn = this.pickColumn(capacityColumns, [
      'prodId',
      'productId',
      'prod_id',
      'product_id',
    ]);
    const netPriceColumn = this.pickColumn(capacityColumns, [
      'netPrice',
      'net_price',
      'unitPrice',
      'unit_price',
    ]);

    if (!idColumn || !netPriceColumn) {
      return null;
    }

    return {
      idColumn,
      productIdColumn,
      netPriceColumn,
    };
  }

  private shouldUseApprovedPriceForCapacityUpdate(
    currentPrice: number,
    incomingPrice: number,
  ): boolean {
    // Ignore obviously invalid placeholder values from PO input.
    if (!Number.isFinite(incomingPrice) || incomingPrice <= 1) {
      return false;
    }

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      return true;
    }

    if (incomingPrice >= currentPrice) {
      return true;
    }

    // "Close" means within 10% below the current unit price.
    const minimumClosePrice = currentPrice * 0.9;
    return incomingPrice >= minimumClosePrice;
  }

  private async applyApprovedCapacityUnitPriceIfEligible(
    executor: { query: PoolClient['query'] },
    productId: number,
    capacityId: number,
    incomingUnitPrice: number,
  ): Promise<boolean> {
    const columnMeta = await this.resolveCapacityPriceUpdateColumns(executor);
    if (!columnMeta) {
      return false;
    }

    const { idColumn, productIdColumn, netPriceColumn } = columnMeta;

    const whereClauses = [`c."${idColumn}"::text = $1::text`];
    const whereValues: unknown[] = [String(capacityId)];

    if (productIdColumn) {
      whereValues.push(String(productId));
      whereClauses.push(`c."${productIdColumn}"::text = $${whereValues.length}::text`);
    }

    const currentPriceResult = await executor.query<{ current_price: string | null }>(
      `SELECT c."${netPriceColumn}"::text AS current_price
       FROM tblcapacity c
       WHERE ${whereClauses.join(' AND ')}
       LIMIT 1`,
      whereValues,
    );

    if (currentPriceResult.rowCount === 0) {
      return false;
    }

    const currentPrice = this.toOptionalNumber(currentPriceResult.rows[0]?.current_price) ?? 0;
    if (!this.shouldUseApprovedPriceForCapacityUpdate(currentPrice, incomingUnitPrice)) {
      return false;
    }

    const comparableCurrent = this.toComparableNumberString(currentPrice);
    const comparableIncoming = this.toComparableNumberString(incomingUnitPrice);
    if (comparableCurrent === comparableIncoming) {
      return false;
    }

    // UPDATE reserves $1 for the new net price, so shift WHERE placeholders by +1.
    const updateWhereClauses = whereClauses.map((clause) =>
      clause.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + 1}`),
    );

    await executor.query(
      `UPDATE tblcapacity c
       SET "${netPriceColumn}" = $1::double precision
       WHERE ${updateWhereClauses.join(' AND ')}`,
      [incomingUnitPrice, ...whereValues],
    );

    return true;
  }

  private async recordCapacityNetPricesForApprovedPurchase(
    executor: { query: PoolClient['query'] },
    purchaseOrderId: number,
    userId?: number,
  ): Promise<number> {
    const purchaseResult = await executor.query<{
      vendor_id: string | null;
      po_number: string | null;
    }>(
      `SELECT
         po.vendor_id::text AS vendor_id,
         COALESCE(
           to_jsonb(po)->>'po_number',
           to_jsonb(po)->>'poNumber',
           to_jsonb(po)->>'po_no'
         ) AS po_number
       FROM tblpurchase_orders po
       WHERE po.id = $1
       LIMIT 1`,
      [purchaseOrderId],
    );

    if (purchaseResult.rowCount === 0) {
      return 0;
    }

    const vendorId = purchaseResult.rows[0]?.vendor_id;
    const poNumber = purchaseResult.rows[0]?.po_number;

    const itemRows = await executor.query<{
      product_id: string | null;
      capacity_id: string | null;
      unit_price: string | null;
    }>(
      `SELECT
         COALESCE(
           to_jsonb(tpi)->>'productId',
           to_jsonb(tpi)->>'product_id'
         ) AS product_id,
         COALESCE(
           to_jsonb(tpi)->>'capacityId',
           to_jsonb(tpi)->>'capacity_id'
         ) AS capacity_id,
         COALESCE(
           to_jsonb(tpi)->>'unitPrice',
           to_jsonb(tpi)->>'unit_price'
         ) AS unit_price
       FROM tbltransaction_product_items tpi
       WHERE COALESCE(
         to_jsonb(tpi)->>'purchaseId',
         to_jsonb(tpi)->>'purchase_id',
         to_jsonb(tpi)->>'po_id'
       ) = $1
       AND LOWER(COALESCE(
         to_jsonb(tpi)->>'transType',
         to_jsonb(tpi)->>'trans_type',
         'purchase'
       )) = 'purchase'`,
      [String(purchaseOrderId)],
    );

    let processedItems = 0;
    for (const item of itemRows.rows) {
      const productId = this.toOptionalNumber(item.product_id);
      const capacityId = this.toOptionalNumber(item.capacity_id);

      if (productId === null || capacityId === null) {
        continue;
      }

      await this.recordCapacityNetPriceFromPurchaseItem(executor, {
        productId,
        capacityId,
        unitPrice: item.unit_price,
        vendorId,
        purchaseOrderId,
        purchaseOrderNo: poNumber,
        userId,
      });

      processedItems += 1;
    }

    return processedItems;
  }

  async create(
    createPurchaseDto: CreatePurchaseDto,
    userId?: number,
    branchId?: number,
    auditActor?: AuditActorContext,
  ) {
    const poNumber = String(createPurchaseDto.poNumber ?? '').trim();
    let status = String(createPurchaseDto.status ?? 'for_approval').trim().toLowerCase() || 'for_approval';

    const productItems = Array.isArray(createPurchaseDto.productItems)
      ? createPurchaseDto.productItems
      : [];

    if (productItems.length === 0) {
      return { success: false, message: 'At least one product item is required' };
    }

    // Validate ACM-specific fields before processing (DTO-level validation)
    const poType = String(createPurchaseDto.poType ?? 'ACU').trim().toUpperCase();
    if (poType === 'ACM') {
      // ACM type: Automatically complete on creation (skip approval)
      status = 'complete';
      CreatePurchaseDto.validateAcm(createPurchaseDto);
    }

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const vendorColumns = await this.getTableColumns(client, 'tblvendors');
        const resolvedVendorId = await this.resolvePurchaseVendor(client, vendorColumns, {
          vendorId: createPurchaseDto.vendorId,
          vendorName: createPurchaseDto.vendor?.name,
          vendorAddress: createPurchaseDto.vendor?.address,
          contactPerson: createPurchaseDto.vendor?.contact_person,
          contactNumber: createPurchaseDto.vendor?.contact_number,
        });

        let computedTotalAmount = 0;
        for (const item of productItems) {
          const itemUnitPrice = this.toOptionalNumber(item.unitPrice) ?? 0;
          const itemDiscountPrice = this.toOptionalNumber(item.discountPrice) ?? 0;
          const priceToUse = itemDiscountPrice > 0 ? itemDiscountPrice : itemUnitPrice;
          const qty = this.toOptionalNumber(item.totalSetQty) ?? 0;
          computedTotalAmount += priceToUse * qty;
        }

        const fallbackTotal = this.toOptionalNumber(createPurchaseDto.totalAmount) ?? 0;
        const totalAmount = computedTotalAmount > 0 ? computedTotalAmount : fallbackTotal;

        if (poNumber) {
          const duplicatePoResult = await client.query<{ id: number }>(
            `SELECT id
             FROM tblpurchase_orders po
             WHERE LOWER(TRIM(COALESCE(
               to_jsonb(po)->>'po_number',
               to_jsonb(po)->>'poNumber',
               to_jsonb(po)->>'po_no',
               ''
             ))) = LOWER(TRIM($1))
             LIMIT 1`,
            [poNumber],
          );

          if (duplicatePoResult.rowCount > 0) {
            throw new Error('PO number already exists');
          }
        }

        const purchaseColumns = await this.getTableColumns(client, 'tblpurchase_orders');
        const poNumberColumn = this.pickColumn(purchaseColumns, ['po_number', 'poNumber', 'po_no']);
        const poTypeColumn = this.pickColumn(purchaseColumns, ['po_type', 'poType', 'poType']);
        const purchaseVendorIdColumn = this.pickColumn(purchaseColumns, ['vendor_id', 'vendorId']);
        const totalAmountColumn = this.pickColumn(purchaseColumns, ['total_amount', 'totalAmount']);
        const statusColumn = this.pickColumn(purchaseColumns, ['status']);
        const createdByColumn = this.pickColumn(purchaseColumns, ['created_by', 'createdBy', 'createdby']);
        const branchIdColumn = this.pickColumn(purchaseColumns, ['branch_id', 'branchId']);

        if (!poNumberColumn || !purchaseVendorIdColumn || !totalAmountColumn || !statusColumn) {
          throw new Error('tblpurchase_orders columns are not aligned with expected fields');
        }

        const purchaseRecord: Record<string, unknown> = {
          [purchaseVendorIdColumn]: resolvedVendorId,
          [totalAmountColumn]: totalAmount,
          [statusColumn]: status,
        };

        // Handle poType (ACU=Aircon Unit, ACP=Aircon Parts, ACM=Aircon Materials)
        if (poTypeColumn) {
          const poType = String(createPurchaseDto.poType ?? 'ACU').trim().toUpperCase();
          if (['ACU', 'ACP', 'ACM'].includes(poType)) {
            purchaseRecord[poTypeColumn] = poType;
          }
        }

        if (poNumberColumn && poNumber) {
          purchaseRecord[poNumberColumn] = poNumber;
        }

        if (createdByColumn && userId) {
          purchaseRecord[createdByColumn] = userId;
        }

        if (branchIdColumn && Number.isFinite(branchId) && Number(branchId) > 0) {
          purchaseRecord[branchIdColumn] = Number(branchId);
        }

        const purchaseInsertResult = await this.runInsert(
          client,
          'tblpurchase_orders',
          purchaseRecord,
        );

        if (purchaseInsertResult.rowCount === 0) {
          throw new Error('Failed to create purchase order');
        }

        const purchaseOrderId = purchaseInsertResult.rows[0].id;

        // Auto-generate po_number for ACM type: 'PO-' + id padded to 6 digits
        const normalizedPoType = String(createPurchaseDto.poType ?? 'ACU').trim().toUpperCase();
        let resolvedPoNumber = poNumber;

        if (normalizedPoType === 'ACM' && poNumberColumn) {
          // Format: YYYY-0001 (year + sequential number padded to 4 digits)
          // Query the max PO number for the current year to get the next sequence
          const year = new Date().getFullYear();
          const yearPrefix = `${year}-`;

          const seqResult = await client.query<{ next_seq: number }>(
            `SELECT COALESCE(
               MAX(
                 CAST(SUBSTRING("${poNumberColumn}" FROM 6) AS INTEGER)
               ), 0
             ) + 1 AS next_seq
             FROM tblpurchase_orders
             WHERE "${poNumberColumn}" LIKE $1
               AND COALESCE(po_type, 'ACU') = 'ACM'`,
            [`${yearPrefix}%`],
          );

          const nextSeq = seqResult.rows[0]?.next_seq ?? 1;
          const generatedPoNumber = `${year}-${nextSeq.toString().padStart(4, '0')}`;

          try {
            await client.query(
              `UPDATE tblpurchase_orders
               SET "${poNumberColumn}" = $1
               WHERE id = $2`,
              [generatedPoNumber, purchaseOrderId],
            );
            resolvedPoNumber = generatedPoNumber;
          } catch (poNumErr: any) {
            // If po_number is a GENERATED ALWAYS column, it can't be updated directly.
            // Fall back to reading the auto-generated value.
            if (
              poNumErr?.message?.includes('can only be updated to DEFAULT') ||
              poNumErr?.message?.includes('generated column')
            ) {
              const fallbackResult = await client.query<{ po_number: string | null }>(
                `SELECT "${poNumberColumn}" AS po_number FROM tblpurchase_orders WHERE id = $1`,
                [purchaseOrderId],
              );
              resolvedPoNumber = fallbackResult.rows[0]?.po_number ?? `PO-${purchaseOrderId.toString().padStart(6, '0')}`;
            } else {
              throw poNumErr;
            }
          }
        } else {
          const purchaseOrderPoNumberResult = await client.query<{ po_number: string | null }>(
            `SELECT COALESCE(
               to_jsonb(po)->>'po_number',
               to_jsonb(po)->>'poNumber',
               to_jsonb(po)->>'po_no'
             ) AS po_number
             FROM tblpurchase_orders po
             WHERE po.id = $1
             LIMIT 1`,
            [purchaseOrderId],
          );

          resolvedPoNumber =
            purchaseOrderPoNumberResult.rows[0]?.po_number?.trim() || poNumber;
        }
        const paymentDetailsInput = createPurchaseDto.paymentDetails;
        const paymentDetailsList = Array.isArray(paymentDetailsInput)
          ? paymentDetailsInput
          : paymentDetailsInput
            ? [paymentDetailsInput]
            : [];

        if (paymentDetailsList.length > 0) {
          const paymentColumns = await this.getTableColumns(client, 'tblpo_payments');
          if (paymentColumns.length > 0) {
            const paymentPoIdColumn = this.pickColumn(paymentColumns, [
              'po_id',
              'poId',
              'purchase_id',
              'purchaseId',
              'purchase_order_id',
              'purchaseOrderId',
            ]);
            const amountColumn = this.pickColumn(paymentColumns, [
              'amount',
              'payment_amount',
              'paymentAmount',
            ]);
            const methodColumn = this.pickColumn(paymentColumns, ['method']);
            const paymentDateColumn = this.pickColumn(paymentColumns, [
              'payment_date',
              'paymentDate',
            ]);
            const bankNameColumn = this.pickColumn(paymentColumns, ['bank_name', 'bankName']);
            const referenceNoColumn = this.pickColumn(paymentColumns, ['reference_no', 'referenceNo']);
            const checkNoColumn = this.pickColumn(paymentColumns, ['check_no', 'checkNo']);
            const chequeDateColumn = this.pickColumn(paymentColumns, [
              'cheque_date',
              'chequeDate',
              'post_dated',
              'postDated',
            ]);
            const issuedByColumn = this.pickColumn(paymentColumns, ['issued_by', 'issuedBy']);
            const termsColumn = this.pickColumn(paymentColumns, ['terms']);
            const termsDueDateColumn = this.pickColumn(paymentColumns, [
              'terms_due_date',
              'termsDueDate',
            ]);
            const paymentStatusColumn = this.pickColumn(paymentColumns, ['status']);
            const downPaymentColumn = this.pickColumn(paymentColumns, [
              'down_payment',
              'downPayment',
            ]);

            if (paymentPoIdColumn) {
              for (const [paymentIndex, paymentDetails] of paymentDetailsList.entries()) {
                if (!paymentDetails || typeof paymentDetails !== 'object') {
                  throw new BadRequestException(`paymentDetails[${paymentIndex}] must be an object`);
                }

                const paymentPayload = paymentDetails as Record<string, unknown>;
                const method = this.validatePurchasePaymentDetails(paymentPayload, paymentIndex);
                const paymentRecord: Record<string, unknown> = {
                  [paymentPoIdColumn]: purchaseOrderId,
                };

                const downPayment = this.toOptionalNumber(paymentPayload.downPayment);
                const providedPaymentAmount = this.toOptionalNumber(paymentPayload.amount);

                const resolvedTermsDueDate = this.deriveTermsDueDate(paymentPayload, method);
                const paymentStatus = this.resolvePaymentStatusForDisplay(
                  method,
                  paymentPayload.status ?? this.getAutoPaymentStatus(method),
                  resolvedTermsDueDate,
                  paymentPayload.chequeDate,
                );

                const fallbackPaymentAmount =
                  paymentStatus === 'paid'
                    ? totalAmount
                    : (downPayment ?? 0);

                const paymentAmount =
                  providedPaymentAmount !== null
                    ? providedPaymentAmount
                    : fallbackPaymentAmount;

                if (amountColumn) {
                  paymentRecord[amountColumn] = paymentAmount;
                }
                if (methodColumn) {
                  paymentRecord[methodColumn] = method;
                }

                const paymentDate = this.toIsoDateOrNull(paymentPayload.paymentDate);
                if (paymentDateColumn && paymentDate) {
                  paymentRecord[paymentDateColumn] = paymentDate;
                }
                if (bankNameColumn && paymentPayload.bankName) {
                  paymentRecord[bankNameColumn] = String(paymentPayload.bankName).trim();
                }
                if (referenceNoColumn && paymentPayload.referenceNo) {
                  paymentRecord[referenceNoColumn] = String(paymentPayload.referenceNo).trim();
                }
                if (checkNoColumn && paymentPayload.checkNo) {
                  paymentRecord[checkNoColumn] = String(paymentPayload.checkNo).trim();
                }
                const chequeDate = this.toIsoDateOrNull(paymentPayload.chequeDate);
                if (chequeDateColumn && chequeDate) {
                  paymentRecord[chequeDateColumn] = chequeDate;
                }
                if (issuedByColumn && paymentPayload.issuedBy) {
                  paymentRecord[issuedByColumn] = String(paymentPayload.issuedBy).trim();
                }

                if (termsColumn && paymentPayload.terms) {
                  paymentRecord[termsColumn] = String(paymentPayload.terms).trim();
                }

                if (termsDueDateColumn && resolvedTermsDueDate) {
                  paymentRecord[termsDueDateColumn] = resolvedTermsDueDate;
                }

                if (paymentStatusColumn) {
                  paymentRecord[paymentStatusColumn] = paymentStatus;
                }

                if (downPaymentColumn && downPayment !== null) {
                  paymentRecord[downPaymentColumn] = downPayment;
                }

                await this.runInsert(client, 'tblpo_payments', paymentRecord);
              }
            }
          }
        }

        const poType = String(createPurchaseDto.poType ?? 'ACU').trim().toUpperCase();
        let itemsTable = 'tbltransaction_product_items';
        if (poType === 'ACP') itemsTable = 'tbltransaction_parts_items';
        if (poType === 'ACM') itemsTable = 'tbltransaction_material_items';

        const transactionItemColumns = await this.getTableColumns(
          client,
          itemsTable,
        );
        if (transactionItemColumns.length > 0) {
          const transTypeColumn = this.pickColumn(transactionItemColumns, [
            'transType',
            'trans_type',
          ]);
          const productIdColumn = this.pickColumn(transactionItemColumns, [
            'productId',
            'product_id',
            'part_id',
            'material_id',
          ]);
          const capacityIdColumn = this.pickColumn(transactionItemColumns, [
            'capacityId',
            'capacity_id',
          ]);
          const unitPriceColumn = this.pickColumn(transactionItemColumns, [
            'unitPrice',
            'unit_price',
          ]);
          const sellPriceColumn = this.pickColumn(transactionItemColumns, [
            'sellPrice',
            'sell_price',
          ]);
          const discountPriceColumn = this.pickColumn(transactionItemColumns, [
            'discountPrice',
            'discount_price',
          ]);
          const unitTypesQtyColumn = this.pickColumn(transactionItemColumns, [
            'unitTypesQty',
            'unit_types_qty',
          ]);
          const totalSetQtyColumn = this.pickColumn(transactionItemColumns, [
            'totalSetQty',
            'total_set_qty',
            'quantity',
          ]);
          const purchaseIdColumn = this.pickColumn(transactionItemColumns, [
            'purchaseId',
            'purchase_id',
            'po_id',
          ]);
          const salesIdColumn = this.pickColumn(transactionItemColumns, [
            'salesId',
            'sales_id',
          ]);
          const statusColumn = this.pickColumn(transactionItemColumns, ['status']);
          const createdByColumn = this.pickColumn(transactionItemColumns, [
            'created_by',
            'createdBy',
            'createdby',
          ]);
          const unitTypesQtyMeta = unitTypesQtyColumn
            ? await this.getColumnMeta(
                client,
                itemsTable,
                unitTypesQtyColumn,
              )
            : null;

          for (const item of productItems) {
            const transType = String(item.transType ?? 'purchase').trim().toLowerCase();
            if (transType !== 'purchase') {
              continue;
            }

            const isProductItems = itemsTable === 'tbltransaction_product_items';
            const isPartsItems = itemsTable === 'tbltransaction_parts_items';
            const isMaterialItems = itemsTable === 'tbltransaction_material_items';

            let resolvedProductOrPartOrMaterialId: number | null = null;
            let resolvedCapacityId: number | null = null;

            if (isProductItems) {
              const productId = this.toOptionalNumber(item.productId);
              const capacityId = this.toOptionalNumber(item.capacityId);
              if (productId === null || capacityId === null) {
                throw new Error('productId and capacityId are required for ACU purchase items');
              }

              const productExistsResult = await client.query<{ id: string | number }>(
                `SELECT id
                 FROM tblproducts
                 WHERE id::text = $1
                 LIMIT 1`,
                [String(productId)],
              );

              if (productExistsResult.rowCount === 0) {
                throw new Error(`Product ID ${productId} does not exist in tblproducts`);
              }

              const capacityExistsResult = await client.query<{ id: string | number }>(
                `SELECT id
                 FROM tblcapacity
                 WHERE id::text = $1
                 LIMIT 1`,
                [String(capacityId)],
              );

              if (capacityExistsResult.rowCount === 0) {
                throw new Error(`Capacity ID ${capacityId} does not exist in tblcapacity`);
              }

              resolvedProductOrPartOrMaterialId = productId;
              resolvedCapacityId = capacityId;
            } else if (isPartsItems) {
              let partId = this.toOptionalNumber((item as any).partId ?? item.productId);

              if (!partId) {
                const partsName = String((item as any).partsName ?? (item as any).partName ?? '').trim();
                const partsCode = String((item as any).partsCode ?? (item as any).partCode ?? '').trim();
                const model = String((item as any).partsModel ?? (item as any).model ?? '').trim();
                let brandId = this.toOptionalNumber(
                  (item as any).partsBrandId ?? (item as any).brandId ?? (item as any).brand_id,
                );
                const brandName = String(
                  (item as any).partsBrandName ?? (item as any).brandName ?? '',
                ).trim();

                if (!brandId && brandName) {
                  const brandLookupResult = await client.query<{ id: string | number }>(
                    `SELECT id
                     FROM tblbrands
                     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                     LIMIT 1`,
                    [brandName],
                  );
                  brandId = this.toOptionalNumber(brandLookupResult.rows[0]?.id);
                }

                if (!partsName) {
                  throw new Error('partsName is required for ACP items when part id is not provided');
                }

                const srp = this.toOptionalNumber(item.sellPrice) ?? 0;
                const discountedPrice = this.toOptionalNumber(item.discountPrice) ?? srp;

                if (partsCode) {
                  const insertPartResult = await client.query<{ id: string | number }>(
                    `INSERT INTO tblparts (brand_id, parts_name, model, parts_code, srp, discounted_price, created_by, updated_at, updated_by)
                     VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, NOW(), $7)
                     ON CONFLICT (parts_code) DO UPDATE
                       SET brand_id = COALESCE(EXCLUDED.brand_id, tblparts.brand_id),
                           parts_name = EXCLUDED.parts_name,
                           model = COALESCE(EXCLUDED.model, tblparts.model),
                           srp = EXCLUDED.srp,
                           discounted_price = EXCLUDED.discounted_price,
                           updated_at = NOW(),
                           updated_by = $7
                     RETURNING id`,
                    [brandId, partsName, model, partsCode, srp, discountedPrice, userId ?? null],
                  );
                  partId = this.toOptionalNumber(insertPartResult.rows[0]?.id);
                } else {
                  const insertPartResult = await client.query<{ id: string | number }>(
                    `INSERT INTO tblparts (brand_id, parts_name, model, srp, discounted_price, created_by, updated_at, updated_by)
                     VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, NOW(), $6)
                     ON CONFLICT (parts_name, brand_id) DO UPDATE
                       SET model = COALESCE(EXCLUDED.model, tblparts.model),
                           srp = EXCLUDED.srp,
                           discounted_price = EXCLUDED.discounted_price,
                           updated_at = NOW(),
                           updated_by = $6
                     RETURNING id`,
                    [brandId, partsName, model, srp, discountedPrice, userId ?? null],
                  );
                  partId = this.toOptionalNumber(insertPartResult.rows[0]?.id);
                }

                if (!partId) {
                  throw new Error('Failed to create/retrieve part id for ACP item');
                }
              }

              const partExistsResult = await client.query<{ id: string | number }>(
                `SELECT id FROM tblparts WHERE id::text = $1 AND deleted_at IS NULL LIMIT 1`,
                [String(partId)],
              );
              if (partExistsResult.rowCount === 0) {
                throw new Error(`Part ID ${partId} does not exist in tblparts`);
              }

              resolvedProductOrPartOrMaterialId = partId;
            } else if (isMaterialItems) {
              let materialId = this.toOptionalNumber((item as any).materialId ?? item.productId);

              if (!materialId) {
                // Inline material creation (same pattern as ACP parts)
                const materialName = String((item as any).materialName ?? '').trim();
                const materialCode = String((item as any).materialCode ?? '').trim();
                const materialUnit = String((item as any).materialUnit ?? '').trim() || 'PCS';
                let brandId = this.toOptionalNumber(
                  (item as any).materialBrandId ?? (item as any).brandId ?? (item as any).brand_id,
                );
                const brandName = String(
                  (item as any).materialBrandName ?? (item as any).brandName ?? '',
                ).trim();

                if (!brandId && brandName) {
                  const brandLookupResult = await client.query<{ id: string | number }>(
                    `SELECT id
                     FROM tblbrands
                     WHERE LOWER(TRIM(COALESCE("brandName", ''))) = LOWER(TRIM($1))
                     LIMIT 1`,
                    [brandName],
                  );
                  brandId = this.toOptionalNumber(brandLookupResult.rows[0]?.id);

                  // Create brand if not found
                  if (!brandId) {
                    const insertBrandResult = await client.query<{ id: string | number }>(
                      `INSERT INTO tblbrands ("brandName", type, created_at)
                       VALUES ($1, 'MAT', NOW())
                       ON CONFLICT DO NOTHING
                       RETURNING id`,
                      [brandName],
                    );
                    brandId = this.toOptionalNumber(insertBrandResult.rows[0]?.id);

                    // If ON CONFLICT hit, fetch existing
                    if (!brandId) {
                      const reLookup = await client.query<{ id: string | number }>(
                        `SELECT id FROM tblbrands WHERE LOWER(TRIM(COALESCE("brandName", ''))) = LOWER(TRIM($1)) LIMIT 1`,
                        [brandName],
                      );
                      brandId = this.toOptionalNumber(reLookup.rows[0]?.id);
                    }
                  }
                }

                if (!materialName) {
                  throw new Error('materialName is required for ACM items when material id is not provided');
                }

                const unitPrice = this.toOptionalNumber(item.unitPrice) ?? 0;
                const sellPrice = this.toOptionalNumber(item.sellPrice) ?? 0;

                materialId = await this.upsertMaterialRecord(client, {
                  brandId,
                  materialName,
                  materialCode,
                  materialUnit,
                  unitPrice,
                  sellPrice,
                  userId: userId ?? null,
                });

                if (!materialId) {
                  throw new Error('Failed to create/retrieve material id for ACM item');
                }

                // Record price history when PO updates material cost
                if (materialId && (unitPrice > 0 || sellPrice > 0)) {
                  try {
                    await client.query(
                      `INSERT INTO tblmaterial_price_history (material_id, unit_price, sell_price, created_by)
                       VALUES ($1, $2, $3, $4)`,
                      [materialId, unitPrice, sellPrice, userId ?? null],
                    );
                  } catch {
                    // Non-fatal — don't block PO if price history fails
                  }
                }
              }

              const materialExistsResult = await client.query<{ id: string | number }>(
                `SELECT id FROM tblmaterials WHERE id::text = $1 AND deleted_at IS NULL LIMIT 1`,
                [String(materialId)],
              );
              if (materialExistsResult.rowCount === 0) {
                throw new Error(`Material ID ${materialId} does not exist in tblmaterials`);
              }

              resolvedProductOrPartOrMaterialId = materialId;
            }

            const unitTypesQty = Array.isArray(item.unitTypesQty) ? item.unitTypesQty : [];
            const qtyFromList = unitTypesQty.reduce((sum, current) => {
              const parsedQty = this.toOptionalNumber(current.qty ?? current.value) ?? 0;
              return sum + (parsedQty > 0 ? parsedQty : 0);
            }, 0);
            const fallbackTotalQty = this.toOptionalNumber(item.totalSetQty) ?? 0;
            const totalQty = qtyFromList > 0 ? qtyFromList : fallbackTotalQty;

            const itemRecord: Record<string, unknown> = {};
            if (transTypeColumn) {
              itemRecord[transTypeColumn] = transType;
            }
            if (productIdColumn) {
              itemRecord[productIdColumn] = resolvedProductOrPartOrMaterialId;
            }
            if (capacityIdColumn && resolvedCapacityId !== null) {
              itemRecord[capacityIdColumn] = resolvedCapacityId;
            }
            if (unitPriceColumn) {
              itemRecord[unitPriceColumn] = this.toOptionalNumber(item.unitPrice) ?? 0;
            }
            if (sellPriceColumn) {
              itemRecord[sellPriceColumn] = this.toOptionalNumber(item.sellPrice) ?? 0;
            }
            if (discountPriceColumn) {
              itemRecord[discountPriceColumn] =
                this.toOptionalNumber(item.discountPrice) ?? 0;
            }
            if (unitTypesQtyColumn) {
              const normalizedUnitTypesQty = unitTypesQty.map((entry) => ({
                label: String(entry.label ?? entry.unitType ?? 'set').trim() || 'set',
                value: this.toOptionalNumber(entry.value ?? entry.qty) ?? 0,
              }));

              if (
                unitTypesQtyMeta &&
                (unitTypesQtyMeta.data_type === 'ARRAY' ||
                  unitTypesQtyMeta.udt_name.startsWith('_'))
              ) {
                itemRecord[unitTypesQtyColumn] = normalizedUnitTypesQty.map(
                  (entry) => `${entry.label}:${entry.value}`,
                );
              } else {
                itemRecord[unitTypesQtyColumn] = JSON.stringify(normalizedUnitTypesQty);
              }
            }
            if (totalSetQtyColumn) {
              itemRecord[totalSetQtyColumn] = totalQty;
            }
            if (purchaseIdColumn) {
              itemRecord[purchaseIdColumn] =
                this.toOptionalNumber(item.purchaseId) ?? purchaseOrderId;
            }
            if (salesIdColumn) {
              itemRecord[salesIdColumn] = this.toOptionalNumber(item.salesId);
            }
            if (statusColumn) {
              itemRecord[statusColumn] = 'pending';
            }
            if (createdByColumn && userId) {
              itemRecord[createdByColumn] = userId;
            }

            if (Object.keys(itemRecord).length > 0) {
              await this.runInsert(client, itemsTable, itemRecord);
            }

          }
        }

        // For ACM type with 'complete' status: automatically add materials to stock
        if (poType === 'ACM' && status === 'complete') {
          const materialItemColumns = await this.getTableColumns(client, 'tbltransaction_material_items');
          const materialIdCol = this.pickColumn(materialItemColumns, ['material_id', 'productId', 'product_id']);
          const quantityCol = this.pickColumn(materialItemColumns, ['quantity', 'totalSetQty', 'total_set_qty']);
          const purchaseIdCol = this.pickColumn(materialItemColumns, ['purchase_id', 'purchaseId']);

          if (materialIdCol && quantityCol && purchaseIdCol) {
            const materialItemsResult = await client.query<{ material_id: string; quantity: string; item_id: string }>(
              `SELECT "${materialIdCol}" AS material_id, "${quantityCol}" AS quantity, id AS item_id
               FROM tbltransaction_material_items
               WHERE "${purchaseIdCol}" = $1`,
              [purchaseOrderId],
            );

            for (const row of materialItemsResult.rows) {
              const materialId = this.toOptionalNumber(row.material_id);
              const qty = this.toOptionalNumber(row.quantity) ?? 0;

              if (materialId && qty > 0) {
                // Update on_hand_stock in tblmaterials
                await client.query(
                  `UPDATE tblmaterials SET on_hand_stock = COALESCE(on_hand_stock, 0) + $1, updated_at = NOW(), updated_by = $2 WHERE id = $3`,
                  [qty, userId ?? null, materialId],
                );

                // Record stock movement (type IN) via MaterialStockService
                await this.materialStockService.recordMovement(
                  {
                    materialId,
                    movementType: 'IN',
                    qty,
                    sourceType: 'PO',
                    sourceId: purchaseOrderId,
                    sourceLineKey: `po-${purchaseOrderId}-item-${row.item_id}`,
                    statusSnapshot: 'complete',
                    remarks: `Inbound from PO #${resolvedPoNumber || purchaseOrderId} (auto-completed)`,
                    createdBy: userId,
                  },
                  { client },
                );
              }
            }
          }
        }

        return {
          purchaseOrderId,
          poNumber: resolvedPoNumber,
          vendorId: resolvedVendorId,
          computedTotalAmount: totalAmount,
        };
      });

      const afterSnapshot = await this.getPurchaseAuditSnapshot(result.purchaseOrderId);
      await this.auditLogService.logMutation({
        action: 'PURCHASE_CREATE',
        entityType: 'purchase-order',
        entityId: result.purchaseOrderId,
        actor: auditActor ?? { userId, branchId },
        description: `Created purchase order ${result.poNumber || `#${result.purchaseOrderId}`}`,
        requestBody: createPurchaseDto as unknown as Record<string, unknown>,
        after: afterSnapshot,
      });

      return {
        success: true,
        message: poType === 'ACM' ? 'Purchase order created successfully and materials added to stock' : 'Purchase request created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create purchase request',
      };
    }
  }

  async findAll(query: ListPurchaseQueryDto) {
    return this.getMasterData(query);
  }

  async getDeliveries(query: ListPurchaseQueryDto): Promise<PurchaseListResponseDto> {
    return this.fetchByMode('deliveries', query);
  }

  async getApprovals(query: ListPurchaseQueryDto): Promise<PurchaseListResponseDto> {
    return this.fetchByMode('approvals', query);
  }

  async getMasterData(query: ListPurchaseQueryDto): Promise<PurchaseListResponseDto> {
    return this.fetchByMode('master-data', query);
  }

  async getMyRequests(query: ListPurchaseQueryDto): Promise<PurchaseListResponseDto> {
    return this.fetchByMode('master-data', query);
  }

  private isApprovalStageStatus(status: string | null | undefined): boolean {
    const normalized = String(status ?? '').trim().toLowerCase();
    return [
      'for_approval',
      'for approval',
      'approval',
      'pending_approval',
      'pending approval',
    ].includes(normalized);
  }

  private async transitionPurchaseStatus(
    id: number,
    nextStatus: string,
    userId?: number,
    options?: {
      approvalOnly?: boolean;
      updateSerialsToInStock?: boolean;
      successMessage?: string;
    },
  ) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid purchase id' };
    }

    const shouldRequireApprovalStage = options?.approvalOnly ?? false;
    const shouldUpdateSerials = options?.updateSerialsToInStock ?? false;

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const existingPurchaseResult = await client.query<{
          id: number;
          status: string | null;
        }>(
          `SELECT
             po.id,
             po.status::text AS status
           FROM tblpurchase_orders po
           WHERE po.id = $1
           LIMIT 1`,
          [id],
        );

        if (existingPurchaseResult.rowCount === 0) {
          throw new Error(`Purchase order ${id} not found`);
        }

        const currentStatus = existingPurchaseResult.rows[0]?.status;
        if (shouldRequireApprovalStage && !this.isApprovalStageStatus(currentStatus)) {
          throw new Error(
            `Cannot perform this action from status '${currentStatus ?? 'unknown'}'. Purchase order must be in 'for_approval' status.`,
          );
        }

        const purchaseColumns = await this.getTableColumns(client, 'tblpurchase_orders');
        const statusColumn = this.pickColumn(purchaseColumns, ['status']);
        if (!statusColumn) {
          throw new Error('tblpurchase_orders status column is not configured');
        }

        await client.query(
          `UPDATE tblpurchase_orders
           SET "${statusColumn}" = $1
           WHERE id = $2`,
          [nextStatus, id],
        );

        // If this PO is linked to a transfer SO, set SO status to 'transfer_received' when PO is received
        if (String(nextStatus).toLowerCase() === 'received') {
          // Find the linked sales order (SO) via tbltransaction_product_items.salesId
          const poRes = await client.query(
            `SELECT COALESCE(
               po.po_type,
               to_jsonb(po)->>'poType',
               to_jsonb(po)->>'po_type',
               'ACU'
             ) AS po_type
             FROM tblpurchase_orders po
             WHERE po.id = $1`,
            [id],
          );
          const poType = this.normalizePoType(poRes.rows[0]?.po_type);
          let itemsTable = 'tbltransaction_product_items';
          if (poType === 'ACP') itemsTable = 'tbltransaction_parts_items';
          else if (poType === 'ACM') itemsTable = 'tbltransaction_material_items';

          const soResult = await client.query<{ salesId: number }>(
            `SELECT DISTINCT tpi."salesId" AS "salesId"
             FROM ${itemsTable} tpi
             WHERE tpi."purchaseId" = $1 AND tpi."salesId" IS NOT NULL
             LIMIT 1`,
            [id],
          );
          if (soResult.rowCount > 0) {
            const transferSalesId = soResult.rows[0].salesId;
            if (transferSalesId) {
              // Update the SO status to 'transfer_received'
              const soColumns = await this.getTableColumns(client, 'tblsales_order');
              const soStatusColumn = this.pickColumn(soColumns, ['status']);
              if (soStatusColumn) {
                await client.query(
                  `UPDATE tblsales_order SET "${soStatusColumn}" = $1 WHERE id = $2`,
                  ['transfer_received', transferSalesId],
                );
              }
            }
          }
        }

        let updatedSerialCount = 0;
        let recordedNetPriceItems = 0;
        let postedMaterialMovements = 0;
        let skippedMaterialMovements = 0;
        if (shouldUpdateSerials) {
          const serialColumns = await this.getTableColumns(client, 'tblserial_numbers');
          const serialStatusColumn = this.pickColumn(serialColumns, ['status']);

          if (!serialStatusColumn) {
            throw new Error('tblserial_numbers status column is not configured');
          }

          const serialPurchaseIdColumn = this.pickColumn(serialColumns, [
            'purchaseId',
            'purchase_id',
            'po_id',
            'purchaseOrderId',
            'purchase_order_id',
          ]);

          const serialUpdateResult = serialPurchaseIdColumn
            ? await client.query(
                `UPDATE tblserial_numbers
                 SET "${serialStatusColumn}" = $1
                 WHERE "${serialPurchaseIdColumn}"::text = $2`,
                ['in-stock', String(id)],
              )
            : await client.query(
                `UPDATE tblserial_numbers sn
                 SET "${serialStatusColumn}" = $1
                 WHERE COALESCE(
                   to_jsonb(sn)->>'purchaseId',
                   to_jsonb(sn)->>'purchase_id',
                   to_jsonb(sn)->>'po_id',
                   to_jsonb(sn)->>'purchaseOrderId',
                   to_jsonb(sn)->>'purchase_order_id'
                 ) = $2`,
                ['in-stock', String(id)],
              );

          updatedSerialCount = serialUpdateResult.rowCount ?? 0;

          recordedNetPriceItems = await this.recordCapacityNetPricesForApprovedPurchase(
            client,
            id,
            userId,
          );

          // const materialResult = await this.materialStockService.applyInboundFromPo(
          //   client,
          //   id,
          //   nextStatus,
          //   userId,
          // );
          // postedMaterialMovements = materialResult.posted;
          // skippedMaterialMovements = materialResult.skipped;
        }

        return {
          purchaseId: id,
          status: nextStatus,
          updatedSerialCount,
          recordedNetPriceItems,
          postedMaterialMovements,
          skippedMaterialMovements,
          updatedBy: userId ?? null,
        };
      });

      return {
        success: true,
        message: options?.successMessage ?? 'Purchase order status updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to update purchase order status',
      };
    }
  }

  async revertInProgress(id: number, userId?: number) {
    return this.transitionPurchaseStatus(id, 'in-progress', userId, {
      approvalOnly: true,
      updateSerialsToInStock: false,
      successMessage: 'Purchase order reverted to in-progress',
    });
  }

  async revertToDeliveries(id: number, userId?: number) {
    return this.transitionPurchaseStatus(id, 'in-progress', userId, {
      approvalOnly: true,
      updateSerialsToInStock: false,
      successMessage: 'Purchase order reverted to deliveries',
    });
  }

  async verifyAndReceive(id: number, userId?: number, auditActor?: AuditActorContext) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid purchase id' };
    }

    const beforeSnapshot = await this.getPurchaseAuditSnapshot(id);

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        // 1. Validate PO exists and check current status
        const poResult = await client.query<{ status: string | null; po_type: string | null }>(
          `SELECT status, COALESCE(po_type, 'ACU') AS po_type FROM tblpurchase_orders WHERE id = $1 LIMIT 1`,
          [id],
        );
        if (poResult.rowCount === 0) {
          throw new Error(`Purchase order ${id} not found`);
        }

        const currentStatus = String(poResult.rows[0]?.status ?? '').trim().toLowerCase();
        const poType = this.normalizePoType(poResult.rows[0]?.po_type);

        // Validate source status: must be 'approved' to transition to 'received'
        if (currentStatus !== 'approved') {
          throw new Error(
            `Cannot mark as received from status '${currentStatus}'. Purchase order must be in 'approved' status.`,
          );
        }

        let itemsTable = 'tbltransaction_product_items';
        if (poType === 'ACP') itemsTable = 'tbltransaction_parts_items';
        else if (poType === 'ACM') itemsTable = 'tbltransaction_material_items';

        // 2. Check if this is a transfer PO (has linked sales order)
        const soResult = await client.query<{ salesId: number }>(
          `SELECT DISTINCT tpi."salesId" AS "salesId"
           FROM ${itemsTable} tpi
           WHERE tpi."purchaseId" = $1 AND tpi."salesId" IS NOT NULL
           LIMIT 1`,
          [id],
        );

        // If no linked sales order, this is a regular PO — just transition to received
        if (soResult.rowCount === 0) {
          await client.query(
            `UPDATE tblpurchase_orders SET status = 'received' WHERE id = $1`,
            [id],
          );

          // For ACM type: record inbound stock movements on received
          if (poType === 'ACM') {
            const materialItemColumns = await this.getTableColumns(client, 'tbltransaction_material_items');
            const materialIdCol = this.pickColumn(materialItemColumns, ['material_id', 'productId', 'product_id']);
            const quantityCol = this.pickColumn(materialItemColumns, ['quantity', 'totalSetQty', 'total_set_qty']);
            const purchaseIdCol = this.pickColumn(materialItemColumns, ['purchase_id', 'purchaseId']);
            const transTypeCol = this.pickColumn(materialItemColumns, ['trans_type', 'transType']);

            if (materialIdCol && quantityCol && purchaseIdCol) {
              const materialItemsResult = await client.query<{ material_id: string; quantity: string; item_id: string }>(
                `SELECT "${materialIdCol}" AS material_id, "${quantityCol}" AS quantity, id AS item_id
                 FROM tbltransaction_material_items
                 WHERE "${purchaseIdCol}" = $1
                 ${transTypeCol ? `AND LOWER(COALESCE("${transTypeCol}", 'purchase')) = 'purchase'` : ''}`,
                [id],
              );

              for (const row of materialItemsResult.rows) {
                const materialId = this.toOptionalNumber(row.material_id);
                const qty = this.toOptionalNumber(row.quantity) ?? 0;

                if (materialId && qty > 0) {
                  // Update on_hand_stock in tblmaterials
                  await client.query(
                    `UPDATE tblmaterials SET on_hand_stock = COALESCE(on_hand_stock, 0) + $1, updated_at = NOW() WHERE id = $2`,
                    [qty, materialId],
                  );

                  // Record stock movement (type IN) via MaterialStockService
                  await this.materialStockService.recordMovement(
                    {
                      materialId,
                      movementType: 'IN',
                      qty,
                      sourceType: 'PO',
                      sourceId: id,
                      sourceLineKey: `po-${id}-item-${row.item_id}`,
                      statusSnapshot: 'received',
                      remarks: `Inbound from ACM purchase order #${id} (received)`,
                      createdBy: userId,
                    },
                    { client },
                  );
                }
              }
            }
          }

          return { purchaseId: id, status: 'received', isTransfer: false };
        }

        // Transfer PO flow: update receiving branch, SO status, and serial numbers
        const salesId = soResult.rows[0].salesId;

        // 3. Get the receiving branch (toBranchId) from tbltransfer_details
        const tdResult = await client.query<{ toBranchId: number | null }>(
          `SELECT to_branch_id AS "toBranchId"
           FROM tbltransfer_details
           WHERE sales_id = $1
           LIMIT 1`,
          [salesId],
        );
        const receivingBranchId = tdResult.rows[0]?.toBranchId ?? null;

        // 4. Update PO status to 'received' and set branchId to receiving branch
        if (receivingBranchId) {
          await client.query(
            `UPDATE tblpurchase_orders SET status = 'received', "branchId" = $1 WHERE id = $2`,
            [receivingBranchId, id],
          );
        } else {
          await client.query(
            `UPDATE tblpurchase_orders SET status = 'received' WHERE id = $1`,
            [id],
          );
        }

        // 5. Update SO status to 'transfer_received'
        await client.query(
          `UPDATE tblsales_order SET status = 'transfer_received' WHERE id = $1`,
          [salesId],
        );

        // 6. Update serial numbers:
        //    - previousSalesId = salesId (traceability)
        //    - salesId = NULL (serials now free at receiving branch)
        //    - branchId = receiving branch
        //    - status = 'in-stock'
        const serialColumns = await this.getTableColumns(client, 'tblserial_numbers');
        const hasPreviousSalesId = serialColumns.some(
          (col) => col.toLowerCase() === 'previoussalesid',
        );

        if (hasPreviousSalesId) {
          if (receivingBranchId) {
            await client.query(
              `UPDATE tblserial_numbers
               SET "previousSalesId" = "salesId", "salesId" = NULL, status = 'in-stock', "branchId" = $2
               WHERE "salesId" = $1`,
              [salesId, receivingBranchId],
            );
          } else {
            await client.query(
              `UPDATE tblserial_numbers
               SET "previousSalesId" = "salesId", "salesId" = NULL, status = 'in-stock'
               WHERE "salesId" = $1`,
              [salesId],
            );
          }
        } else {
          if (receivingBranchId) {
            await client.query(
              `UPDATE tblserial_numbers
               SET "salesId" = NULL, status = 'in-stock', "branchId" = $2
               WHERE "salesId" = $1`,
              [salesId, receivingBranchId],
            );
          } else {
            await client.query(
              `UPDATE tblserial_numbers
               SET "salesId" = NULL, status = 'in-stock'
               WHERE "salesId" = $1`,
              [salesId],
            );
          }
        }

        return { purchaseId: id, salesId, status: 'received', receivingBranchId, isTransfer: true };
      });

      const afterSnapshot = await this.getPurchaseAuditSnapshot(id);
      await this.auditLogService.logMutation({
        action: 'PURCHASE_TRANSFER_RECEIVED',
        entityType: 'purchase-order',
        entityId: id,
        actor: auditActor ?? { userId },
        description: `Verified and received purchase order ${String((afterSnapshot?.poNumber as string | undefined) ?? '').trim() || `#${id}`}`,
        before: beforeSnapshot,
        after: afterSnapshot,
        metadata: {
          salesId: result.salesId,
          receivingBranchId: result.receivingBranchId,
          isTransfer: result.isTransfer,
        },
      });

      return {
        success: true,
        message: result.isTransfer
          ? 'Transfer PO verified and received. Serials are now in-stock.'
          : 'Purchase order marked as received.',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to verify and receive purchase order',
      };
    }
  }

  async approve(id: number, userId?: number, auditActor?: AuditActorContext) {
    const beforeSnapshot = await this.getPurchaseAuditSnapshot(id);
    // Approve the PO: transition from for_approval → approved.
    // The approvalOnly flag ensures the current status is in the approval stage (for_approval).
    const response = await this.transitionPurchaseStatus(id, 'approved', userId, {
      approvalOnly: true,
      updateSerialsToInStock: false,
      successMessage: 'Purchase order approved',
    });

    if (response.success) {
      // Record approval metadata (approving user, date)
      try {
        await this.databaseService.query(
          `UPDATE tblpurchase_orders
           SET approve_by = $1, "approveDate" = NOW()
           WHERE id = $2`,
          [userId ?? null, id],
        );
      } catch {
        // Non-critical: approval metadata columns may not exist in all environments
      }

      const afterSnapshot = await this.getPurchaseAuditSnapshot(id);
      await this.auditLogService.logMutation({
        action: 'PURCHASE_APPROVE',
        entityType: 'purchase-order',
        entityId: id,
        actor: auditActor ?? { userId },
        description: `Approved purchase order ${String((afterSnapshot?.poNumber as string | undefined) ?? '').trim() || `#${id}`}`,
        before: beforeSnapshot,
        after: afterSnapshot,
        metadata: {
          updatedSerialCount: response.data?.updatedSerialCount,
          recordedNetPriceItems: response.data?.recordedNetPriceItems,
        },
      });
    }

    return response;
  }

  /**
   * Mark a purchase request as completed (received) after serial numbers have been scanned
   * and the scanned counts satisfy the requested quantities.
   */
  async completeRequest(
    id: number,
    userId?: number,
    auditActor?: AuditActorContext,
  ): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid purchase id' };
    }

    const beforeSnapshot = await this.getPurchaseAuditSnapshot(id);

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        // Determine PO type
        const poTypeResult = await client.query<{ po_type: string | null }>(
          `SELECT COALESCE(po.po_type, to_jsonb(po)->>'poType', to_jsonb(po)->>'po_type', 'ACU') AS po_type
           FROM tblpurchase_orders po WHERE po.id = $1 LIMIT 1`,
          [id],
        );
        if (poTypeResult.rowCount === 0) {
          throw new Error('Purchase order not found');
        }
        const poType = this.normalizePoType(poTypeResult.rows[0]?.po_type);

        // For ACM (Materials), skip serial validation, complete, and record stock movements
        if (poType === 'ACM') {
          // Validate source status: must be 'received' to transition to 'completed'
          const statusCheckResult = await client.query<{ status: string | null }>(
            `SELECT status FROM tblpurchase_orders WHERE id = $1 LIMIT 1`,
            [id],
          );
          const currentStatus = String(statusCheckResult.rows[0]?.status ?? '').trim().toLowerCase();
          if (currentStatus !== 'received') {
            throw new Error(
              `Cannot complete purchase order from status '${currentStatus}'. Purchase order must be in 'received' status.`,
            );
          }

          const purchaseColumns = await this.getTableColumns(client, 'tblpurchase_orders');
          const statusColumn = this.pickColumn(purchaseColumns, ['status']);
          if (!statusColumn) {
            throw new Error('tblpurchase_orders status column is not configured');
          }

          await client.query(
            `UPDATE tblpurchase_orders SET "${statusColumn}" = $1 WHERE id = $2`,
            ['completed', id],
          );

          // Stock movements already recorded on 'received' transition.
          // completeRequest just finalizes the status.

          return { purchaseId: id, status: 'completed' };
        }

        // For ACP (Parts), skip serial validation and just complete
        if (poType === 'ACP') {
          const purchaseColumns = await this.getTableColumns(client, 'tblpurchase_orders');
          const statusColumn = this.pickColumn(purchaseColumns, ['status']);
          if (!statusColumn) {
            throw new Error('tblpurchase_orders status column is not configured');
          }

          await client.query(
            `UPDATE tblpurchase_orders SET "${statusColumn}" = $1 WHERE id = $2`,
            ['completed', id],
          );

          return { purchaseId: id, status: 'completed' };
        }

        // 1. Load PO items and serial counts (ACU only)
        const productRows = await client.query<{
          id: number;
          product_id: string | null;
          capacity_id: string | null;
          total_set_qty: string | null;
        }>(
          `SELECT tpi.id, 
                  COALESCE(to_jsonb(tpi)->>'productId', to_jsonb(tpi)->>'product_id') AS product_id,
                  COALESCE(to_jsonb(tpi)->>'capacityId', to_jsonb(tpi)->>'capacity_id') AS capacity_id,
                  COALESCE(to_jsonb(tpi)->>'totalSetQty', to_jsonb(tpi)->>'total_set_qty', '0')::text AS total_set_qty
           FROM tbltransaction_product_items tpi
           WHERE COALESCE(to_jsonb(tpi)->>'purchaseId', to_jsonb(tpi)->>'purchase_id', to_jsonb(tpi)->>'po_id') = $1
             AND LOWER(COALESCE(to_jsonb(tpi)->>'transType', to_jsonb(tpi)->>'trans_type', 'purchase')) = 'purchase'`,
          [String(id)],
        );

        // For each item compute scanned/in-stock serials linked to this PO
        const serialColumns = await this.getTableColumns(client, 'tblserial_numbers');
        const serialPurchaseIdColumn = this.pickColumn(serialColumns, [
          'purchaseId',
          'purchase_id',
          'po_id',
          'purchaseOrderId',
          'purchase_order_id',
        ]);
        const serialProductIdColumn = this.pickColumn(serialColumns, ['productId', 'product_id']);
        const serialCapacityIdColumn = this.pickColumn(serialColumns, ['capacityId', 'capacity_id']);
        const serialStatusColumn = this.pickColumn(serialColumns, ['status']);

        if (!serialPurchaseIdColumn || !serialProductIdColumn || !serialCapacityIdColumn) {
          throw new Error('Serial number table is not configured to validate received quantities');
        }

        for (const row of productRows.rows) {
          const productId = String(row.product_id ?? '').trim();
          const capacityId = String(row.capacity_id ?? '').trim();
          const expectedQty = Number(row.total_set_qty ?? '0') || 0;

          if (!productId || !capacityId) {
            continue;
          }

          const countResult = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM tblserial_numbers
             WHERE (COALESCE("${serialPurchaseIdColumn}"::text, '') = $1 OR COALESCE("${serialPurchaseIdColumn}", 0) = $2)
               AND COALESCE("${serialProductIdColumn}"::text, '') = $3
               AND COALESCE("${serialCapacityIdColumn}"::text, '') = $4
               AND LOWER(COALESCE("${serialStatusColumn}", '')) IN ('in-stock', 'in_stock', 'instock', 'scanned')`,
            [String(id), id, productId, capacityId],
          );

          const scannedCount = Number(countResult.rows[0]?.count ?? '0') || 0;
          if (scannedCount < expectedQty) {
            throw new Error(
              `Serials for product ${productId} capacity ${capacityId} are incomplete: expected ${expectedQty}, found ${scannedCount}`,
            );
          }
        }

        // 2. All items satisfied — mark PO as request_completed
        const purchaseColumns = await this.getTableColumns(client, 'tblpurchase_orders');
        const statusColumn = this.pickColumn(purchaseColumns, ['status']);
        if (!statusColumn) {
          throw new Error('tblpurchase_orders status column is not configured');
        }

        await client.query(
          `UPDATE tblpurchase_orders SET "${statusColumn}" = $1 WHERE id = $2`,
          ['completed', id],
        );

        // 3. Update serial numbers status to in-stock
        await client.query(
          `UPDATE tblserial_numbers
           SET status = 'in-stock'
           WHERE (COALESCE("${serialPurchaseIdColumn}"::text, '') = $1 OR COALESCE("${serialPurchaseIdColumn}", 0) = $2)
             AND LOWER(COALESCE("${serialStatusColumn}", '')) IN ('in-stock', 'in_stock', 'instock', 'scanned')`,
          [String(id), id],
        );

        return { purchaseId: id, status: 'request_completed' };
      });

      const afterSnapshot = await this.getPurchaseAuditSnapshot(id);
      await this.auditLogService.logMutation({
        action: 'PURCHASE_RECEIVE_REQUEST',
        entityType: 'purchase-order',
        entityId: id,
        actor: auditActor ?? { userId },
        description: `Completed purchase request #${id}`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      return { success: true, message: 'Purchase request completed', data: result };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Failed to complete purchase request' };
    }
  }

  async searchMaterials(query?: string) {
    const normalizedQuery = String(query ?? '').trim();

    if (!normalizedQuery) {
      return { success: true, items: [] };
    }

    try {
      const searchTerm = `%${normalizedQuery}%`;

      const result = await this.databaseService.query<{
        id: number;
        material_name: string;
        material_code: string | null;
        unit: string | null;
        unit_price: string | null;
        sell_price: string | null;
        brand_name: string | null;
        product_type: string | null;
      }>(
        `SELECT
           m.id,
           m.material_name,
           m.material_code,
           m.unit,
           m.unit_price::text AS unit_price,
           m.sell_price::text AS sell_price,
           b."brandName" AS brand_name,
           pt.name AS product_type
         FROM tblmaterials m
         LEFT JOIN tblbrands b ON m.brand_id = b.id
         LEFT JOIN tblproducttypes pt ON b.product_type_id = pt.id
         WHERE m.deleted_at IS NULL
           AND (
             m.material_name ILIKE $1
             OR m.material_code ILIKE $1
             OR b."brandName" ILIKE $1
             OR pt.name ILIKE $1
           )
         ORDER BY m.material_name ASC
         LIMIT 50`,
        [searchTerm],
      );

      return {
        success: true,
        items: result.rows.map((row) => ({
          id: row.id,
          material_name: row.material_name,
          material_code: row.material_code ?? null,
          unit: row.unit ?? '',
          unit_price: this.toOptionalNumber(row.unit_price) ?? 0,
          sell_price: this.toOptionalNumber(row.sell_price) ?? 0,
          brand_name: row.brand_name ?? null,
          product_type: row.product_type ?? null,
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to search materials',
        items: [],
      };
    }
  }

  async getVendors(search?: string) {
    const normalizedSearch = String(search ?? '').trim();

    try {
      const params: unknown[] = [];
      let whereClause = '';

      if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        whereClause = `WHERE LOWER(COALESCE(to_jsonb(v)->>'name', to_jsonb(v)->>'vendor_name', '')) LIKE LOWER($1)`;
      }

      const result = await this.databaseService.query<{ id: string; name: string | null }>(
        `SELECT
           v.id::text AS id,
           COALESCE(to_jsonb(v)->>'name', to_jsonb(v)->>'vendor_name') AS name
         FROM tblvendors v
         ${whereClause}
         ORDER BY COALESCE(to_jsonb(v)->>'name', to_jsonb(v)->>'vendor_name') ASC
         LIMIT 50`,
        params,
      );

      return {
        success: true,
        items: result.rows.map((row) => ({
          id: row.id,
          name: row.name ?? row.id,
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load vendors',
        items: [],
      };
    }
  }

  async findOne(
    id: number,
    options?: {
      includeInstalled?: boolean;
      preferPoLinkedSerials?: boolean;
    },
  ) {
    if (!Number.isFinite(id) || id <= 0) {
      return {
        success: false,
        message: 'Invalid purchase id',
      };
    }

    try {
      const purchaseResult = await this.databaseService.query<PurchaseDetailRow>(
        `SELECT
           po.id,
           po.po_number AS "poNumber",
           COALESCE(to_jsonb(po)->>'po_type', to_jsonb(po)->>'poType', 'ACU') AS "poType",
           po.vendor_id::text AS "vendorId",
           COALESCE(to_jsonb(v)->>'name', to_jsonb(v)->>'vendor_name') AS "vendorName",
           COALESCE(to_jsonb(v)->>'address', '') AS "vendorAddress",
           COALESCE(
             to_jsonb(v)->>'contact_person',
             to_jsonb(v)->>'contactPerson',
             ''
           ) AS "vendorContactPerson",
           COALESCE(
             to_jsonb(v)->>'contact_number',
             to_jsonb(v)->>'contactNumber',
             ''
           ) AS "vendorContactNumber",
           po.total_amount::text AS "totalAmount",
           COALESCE(po.status, 'pending') AS status,
           po.created_at::text AS "createdAt"
         FROM tblpurchase_orders po
         LEFT JOIN tblvendors v
           ON v.id::text = po.vendor_id::text
         WHERE po.id = $1
         LIMIT 1`,
        [id],
      );

      if (purchaseResult.rowCount === 0) {
        return {
          success: false,
          message: `Purchase order ${id} not found`,
        };
      }

      const paymentResult = await this.databaseService.query<PurchasePaymentRow>(
        `SELECT
           COALESCE(to_jsonb(pp)->>'method', null) AS method,
           COALESCE(
             NULLIF(
               COALESCE(
                 to_jsonb(pp)->>'amount',
                 to_jsonb(pp)->>'payment_amount',
                 to_jsonb(pp)->>'paymentAmount',
                 ''
               ),
               ''
             )::numeric,
             0
           )::text AS amount,
           COALESCE(to_jsonb(pp)->>'terms', null) AS terms,
           COALESCE(
             to_jsonb(pp)->>'terms_due_date',
             to_jsonb(pp)->>'termsDueDate',
             null
           ) AS "termsDueDate",
           COALESCE(to_jsonb(pp)->>'status', null) AS status,
           COALESCE(
             to_jsonb(pp)->>'payment_date',
             to_jsonb(pp)->>'paymentDate',
             null
           ) AS "paymentDate",
           COALESCE(
             to_jsonb(pp)->>'bank_name',
             to_jsonb(pp)->>'bankName',
             null
           ) AS "bankName",
           COALESCE(
             to_jsonb(pp)->>'reference_no',
             to_jsonb(pp)->>'referenceNo',
             null
           ) AS "referenceNo",
           COALESCE(
             to_jsonb(pp)->>'check_no',
             to_jsonb(pp)->>'checkNo',
             null
           ) AS "checkNo",
           COALESCE(
             to_jsonb(pp)->>'cheque_date',
             to_jsonb(pp)->>'chequeDate',
             to_jsonb(pp)->>'post_dated',
             to_jsonb(pp)->>'postDated',
             null
           ) AS "chequeDate",
           COALESCE(
             to_jsonb(pp)->>'issued_by',
             to_jsonb(pp)->>'issuedBy',
             null
           ) AS "issuedBy",
           COALESCE(
             NULLIF(
               COALESCE(
                 to_jsonb(pp)->>'down_payment',
                 to_jsonb(pp)->>'downPayment',
                 ''
               ),
               ''
             )::numeric,
             0
           )::text AS "downPayment"
         FROM tblpo_payments pp
         WHERE COALESCE(
           to_jsonb(pp)->>'po_id',
           to_jsonb(pp)->>'poId',
           to_jsonb(pp)->>'purchase_id',
           to_jsonb(pp)->>'purchaseId',
           to_jsonb(pp)->>'purchase_order_id',
           to_jsonb(pp)->>'purchaseOrderId'
         ) = $1
         ORDER BY pp.id ASC`,
        [String(id)],
      );

      const purchase = purchaseResult.rows[0];
      const poType = this.normalizePoType(purchase.poType);
      let itemsTable = 'tbltransaction_product_items';
      if (poType === 'ACP') itemsTable = 'tbltransaction_parts_items';
      else if (poType === 'ACM') itemsTable = 'tbltransaction_material_items';

      const productResult = await this.databaseService.query<PurchaseProductRow>(
        `SELECT
           tpi.id,
           COALESCE(
             to_jsonb(tpi)->>'transType',
             to_jsonb(tpi)->>'trans_type',
             'purchase'
           ) AS "transType",
           COALESCE(
             to_jsonb(tpi)->>'productId',
             to_jsonb(tpi)->>'product_id',
             to_jsonb(tpi)->>'part_id',
             to_jsonb(tpi)->>'material_id'
           ) AS "productId",
           COALESCE(
             to_jsonb(tpi)->>'capacityId',
             to_jsonb(tpi)->>'capacity_id'
           ) AS "capacityId",
           COALESCE(
             NULLIF(
               COALESCE(to_jsonb(tpi)->>'unitPrice', to_jsonb(tpi)->>'unit_price', ''),
               ''
             )::numeric,
             0
           )::text AS "unitPrice",
           COALESCE(
             NULLIF(
               COALESCE(to_jsonb(tpi)->>'sellPrice', to_jsonb(tpi)->>'sell_price', ''),
               ''
             )::numeric,
             0
           )::text AS "sellPrice",
           COALESCE(
             NULLIF(
               COALESCE(to_jsonb(tpi)->>'discountPrice', to_jsonb(tpi)->>'discount_price', ''),
               ''
             )::numeric,
             0
           )::text AS "discountPrice",
           COALESCE(
             to_jsonb(tpi)->'unitTypesQty',
             to_jsonb(tpi)->'unit_types_qty',
             '[]'::jsonb
           ) AS "unitTypesQty",
           COALESCE(
             CASE
               WHEN COALESCE(
                 to_jsonb(tpi)->>'totalSetQty',
                 to_jsonb(tpi)->>'total_set_qty',
                 to_jsonb(tpi)->>'quantity',
                 ''
               ) ~ '^-?\\d+$'
                 AND ABS(
                   COALESCE(
                     to_jsonb(tpi)->>'totalSetQty',
                     to_jsonb(tpi)->>'total_set_qty',
                     to_jsonb(tpi)->>'quantity',
                     '0'
                   )::numeric
                 ) <= 2147483647
                 THEN COALESCE(
                   to_jsonb(tpi)->>'totalSetQty',
                   to_jsonb(tpi)->>'total_set_qty',
                   to_jsonb(tpi)->>'quantity',
                   '0'
                 )::int
               ELSE 0
             END,
             0
           )::text AS "totalSetQty",
           COALESCE(
             to_jsonb(tpi)->>'purchaseId',
             to_jsonb(tpi)->>'purchase_id',
             to_jsonb(tpi)->>'po_id'
           ) AS "purchaseId",
           COALESCE(
             to_jsonb(tpi)->>'salesId',
             to_jsonb(tpi)->>'sales_id'
           ) AS "salesId",
           COALESCE(to_jsonb(tpi)->>'status', null) AS status,
           -- ACP/ACM specific fields fetched via joins
           p.parts_name AS "partsName",
           p.parts_code AS "partsCode",
           p.model AS "partsModel",
           p.brand_id::text AS "partsBrandId",
           bp."brandName" AS "partsBrandName",
           m.material_name AS "materialName",
           m.material_code AS "materialCode",
           m.unit AS "materialUnit",
           m.brand_id::text AS "materialBrandId",
           bm."brandName" AS "materialBrandName"
         FROM ${itemsTable} tpi
         LEFT JOIN tblparts p ON p.id::text = COALESCE(to_jsonb(tpi)->>'productId', to_jsonb(tpi)->>'product_id', to_jsonb(tpi)->>'part_id')
         LEFT JOIN tblbrands bp ON bp.id = p.brand_id
         LEFT JOIN tblmaterials m ON m.id::text = COALESCE(to_jsonb(tpi)->>'productId', to_jsonb(tpi)->>'product_id', to_jsonb(tpi)->>'material_id')
         LEFT JOIN tblbrands bm ON bm.id = m.brand_id
         WHERE COALESCE(
           to_jsonb(tpi)->>'purchaseId',
           to_jsonb(tpi)->>'purchase_id',
           to_jsonb(tpi)->>'po_id'
         ) = $1
         AND LOWER(COALESCE(
           to_jsonb(tpi)->>'transType',
           to_jsonb(tpi)->>'trans_type',
           'purchase'
         )) = 'purchase'
         ORDER BY tpi.id ASC`,
        [String(id)],
      );

      const serialResult = await this.databaseService.query<PurchaseSerialRow>(
        `SELECT
           COALESCE(
             to_jsonb(sn)->>'serialNumber',
             to_jsonb(sn)->>'serial_number'
           ) AS "serialNumber",
           COALESCE(
             to_jsonb(sn)->>'productId',
             to_jsonb(sn)->>'product_id',
             to_jsonb(sn)->>'prodId',
             to_jsonb(sn)->>'prod_id'
           ) AS "productId",
           COALESCE(
             to_jsonb(sn)->>'capacityId',
             to_jsonb(sn)->>'capacity_id',
             to_jsonb(sn)->>'capId',
             to_jsonb(sn)->>'cap_id'
           ) AS "capacityId",
           COALESCE(to_jsonb(sn)->>'status', '') AS status,
           COALESCE(
             to_jsonb(sn)->>'unitType',
             to_jsonb(sn)->>'unit_type'
           ) AS "unitType"
         FROM tblserial_numbers sn
         WHERE COALESCE(
           to_jsonb(sn)->>'purchaseId',
           to_jsonb(sn)->>'purchase_id',
           to_jsonb(sn)->>'po_id'
         ) = $1`,
        [String(id)],
      );

      const serialMap = new Map<string, Record<string, string[]>>();
      const serialStatuses: Record<string, string> = {};
      const poLinkedSerialNumbers: Record<string, string[]> = {};
      const unresolvedSerialsByUnitType: Record<string, string[]> = {};
      const includeInstalled = options?.includeInstalled === true;
      const preferPoLinkedSerials = options?.preferPoLinkedSerials === true;
      for (const serialRow of serialResult.rows) {
        const productId = String(serialRow.productId ?? '').trim();
        const capacityId = String(serialRow.capacityId ?? '').trim();
        const serialNumber = this.normalizeSerialNumber(serialRow.serialNumber);
        const serialStatus = String((serialRow as { status?: string | null }).status ?? '').trim().toLowerCase();
        const unitType = String(serialRow.unitType ?? 'set').trim().toLowerCase() || 'set';

        if (!serialNumber || (!includeInstalled && serialStatus === 'installed')) {
          continue;
        }

        serialStatuses[serialNumber.toLowerCase()] = serialStatus || 'in_stock';

        if (!Array.isArray(poLinkedSerialNumbers[unitType])) {
          poLinkedSerialNumbers[unitType] = [];
        }

        if (!poLinkedSerialNumbers[unitType].includes(serialNumber)) {
          poLinkedSerialNumbers[unitType].push(serialNumber);
        }

        if (!productId || !capacityId) {
          if (!Array.isArray(unresolvedSerialsByUnitType[unitType])) {
            unresolvedSerialsByUnitType[unitType] = [];
          }

          if (!unresolvedSerialsByUnitType[unitType].includes(serialNumber)) {
            unresolvedSerialsByUnitType[unitType].push(serialNumber);
          }

          continue;
        }

        const key = `${productId}::${capacityId}`;
        const existing = serialMap.get(key) ?? {};

        if (!Array.isArray(existing[unitType])) {
          existing[unitType] = [];
        }

        if (!existing[unitType].includes(serialNumber)) {
          existing[unitType].push(serialNumber);
        }

        serialMap.set(key, existing);
      }

      const mappedProductItems = productResult.rows.map((product) => {
        const normalizedProductId = String(product.productId ?? '').trim();
        const normalizedCapacityId = String(product.capacityId ?? '').trim();
        const serialKey = `${normalizedProductId}::${normalizedCapacityId}`;

        return {
          ...product,
          id: product.id,
          transType: product.transType ?? 'purchase',
          productId: normalizedProductId,
          capacityId: normalizedCapacityId,
          unitPrice: this.toOptionalNumber(product.unitPrice) ?? 0,
          sellPrice: this.toOptionalNumber(product.sellPrice) ?? 0,
          discountPrice: this.toOptionalNumber(product.discountPrice) ?? 0,
          unitTypesQty: this.normalizeUnitTypesQty(product.unitTypesQty),
          totalSetQty: this.toOptionalNumber(product.totalSetQty) ?? 0,
          purchaseId: this.toOptionalNumber(product.purchaseId) ?? id,
          salesId: this.toOptionalNumber(product.salesId),
          status: product.status ?? 'pending',
          serialNumbers: serialMap.get(serialKey) ?? {},
        };
      });

      if (
        mappedProductItems.length === 1 &&
        Object.keys(unresolvedSerialsByUnitType).length > 0
      ) {
        const onlyItem = mappedProductItems[0];
        const mergedSerialNumbers: Record<string, string[]> = {
          ...(onlyItem.serialNumbers ?? {}),
        };

        for (const [unitType, serials] of Object.entries(unresolvedSerialsByUnitType)) {
          if (!Array.isArray(mergedSerialNumbers[unitType])) {
            mergedSerialNumbers[unitType] = [];
          }

          for (const serial of serials) {
            if (!mergedSerialNumbers[unitType].includes(serial)) {
              mergedSerialNumbers[unitType].push(serial);
            }
          }
        }

        onlyItem.serialNumbers = mergedSerialNumbers;
      }

      // --- Transfer PO logic ---
      // If any productItem has a salesId, treat as transfer PO
      const transferProduct = mappedProductItems.find((item) => !!item.salesId);
      let isTransferPO = false;
      let originatingSalesOrder: null | {
        id: number;
        soNumber: string | null;
        branchId?: string | null;
        branchName?: string | null;
        productItems?: any[];
        transferDetails?: any | null;
      } = null;

      if (transferProduct && transferProduct.salesId) {
        isTransferPO = true;
        const soId = transferProduct.salesId;
        let soNumber: string | null = null;
        let soProductItems: any[] = [];
        let transferDetails: any | null = null;

        try {
          // 1. Get SO number
          const soResult = await this.databaseService.query<{ so_number: string | null }>(
            `SELECT COALESCE(to_jsonb(so)->>'so_number', to_jsonb(so)->>'soNumber', NULL) AS so_number
             FROM tblsales_order so WHERE so.id = $1 LIMIT 1`,
            [soId],
          );
          if (soResult.rowCount > 0) {
            soNumber = soResult.rows[0].so_number ?? null;
          }

          // 2. Fetch transfer details from tbltransfer_details
          const tdResult = await this.databaseService.query<{
            id: number;
            fromBranchId: string | null;
            fromBranchName: string | null;
            toBranchId: string | null;
            toBranchName: string | null;
            transferDate: string | null;
            expectedDeliveryDate: string | null;
            actualDeliveryDate: string | null;
            transferStatus: string | null;
            transferNotes: string | null;
          }>(
            `SELECT
               td.id,
               td.from_branch_id::text AS "fromBranchId",
               fb."branchName" AS "fromBranchName",
               td.to_branch_id::text AS "toBranchId",
               tb."branchName" AS "toBranchName",
               td.transfer_date::text AS "transferDate",
               td.expected_delivery_date::text AS "expectedDeliveryDate",
               td.actual_delivery_date::text AS "actualDeliveryDate",
               td.transfer_status AS "transferStatus",
               td.transfer_notes AS "transferNotes"
             FROM tbltransfer_details td
             LEFT JOIN tblbranches fb ON fb.id = td.from_branch_id
             LEFT JOIN tblbranches tb ON tb.id = td.to_branch_id
             WHERE td.sales_id = $1
             LIMIT 1`,
            [soId],
          );
          if (tdResult.rowCount > 0) {
            transferDetails = tdResult.rows[0];
          }

          // 3. Fetch serial numbers from tblserial_numbers using salesId OR previousSalesId
          //    This covers both the original SO serials and transferred serials
          const soSerialResult = await this.databaseService.query<{
            serialNumber: string | null;
            productId: string | null;
            capacityId: string | null;
            unitType: string | null;
          }>(
            `SELECT
               COALESCE(to_jsonb(sn)->>'serialNumber', to_jsonb(sn)->>'serial_number') AS "serialNumber",
               COALESCE(to_jsonb(sn)->>'productId', to_jsonb(sn)->>'product_id') AS "productId",
               COALESCE(to_jsonb(sn)->>'capacityId', to_jsonb(sn)->>'capacity_id') AS "capacityId",
               COALESCE(to_jsonb(sn)->>'unitType', to_jsonb(sn)->>'unit_type', 'set') AS "unitType"
             FROM tblserial_numbers sn
             WHERE
               sn."salesId"::text = $1
               OR sn."previousSalesId"::text = $1`,
            [String(soId)],
          );

          // Build serialNumbers map grouped by productId::capacityId
          const soSerialMap = new Map<string, Record<string, string[]>>();
          for (const row of soSerialResult.rows) {
            const pId = String(row.productId ?? '').trim();
            const cId = String(row.capacityId ?? '').trim();
            const serial = this.normalizeSerialNumber(row.serialNumber);
            const unitType = String(row.unitType ?? 'set').trim().toLowerCase() || 'set';
            if (!serial || !pId || !cId) continue;
            const key = `${pId}::${cId}`;
            const existing = soSerialMap.get(key) ?? {};
            if (!Array.isArray(existing[unitType])) existing[unitType] = [];
            if (!existing[unitType].includes(serial)) existing[unitType].push(serial);
            soSerialMap.set(key, existing);
          }

          // 4. Fetch SO product items and attach serial numbers from the map
          const soProductResult = await this.databaseService.query<{
            id: number;
            productId: string | null;
            capacityId: string | null;
          }>(
            `SELECT
               tpi.id,
               COALESCE(to_jsonb(tpi)->>'productId', to_jsonb(tpi)->>'product_id', '') AS "productId",
               COALESCE(to_jsonb(tpi)->>'capacityId', to_jsonb(tpi)->>'capacity_id', '') AS "capacityId"
             FROM tbltransaction_product_items tpi
             WHERE COALESCE(to_jsonb(tpi)->>'salesId', to_jsonb(tpi)->>'sales_id') = $1
               AND LOWER(COALESCE(to_jsonb(tpi)->>'transType', to_jsonb(tpi)->>'trans_type', 'sales')) = 'sales'`,
            [String(soId)],
          );

          soProductItems = soProductResult.rows.map((row) => {
            const key = `${String(row.productId ?? '').trim()}::${String(row.capacityId ?? '').trim()}`;
            return {
              id: row.id,
              productId: row.productId,
              capacityId: row.capacityId,
              serialNumbers: soSerialMap.get(key) ?? {},
            };
          });
        } catch {}

        originatingSalesOrder = {
          id: soId,
          soNumber,
          productItems: soProductItems,
          transferDetails,
        };
      }

      return {
        success: true,
        item: {
          id: purchase.id,
          poNumber: purchase.poNumber,
          vendorId: purchase.vendorId,
          vendorName: purchase.vendorName,
          vendorAddress: purchase.vendorAddress,
          vendorContactPerson: purchase.vendorContactPerson,
          vendorContactNumber: purchase.vendorContactNumber,
          totalAmount: this.toOptionalNumber(purchase.totalAmount) ?? 0,
          status: purchase.status,
          poType: this.normalizePoType(purchase.poType),
          paymentDetails: paymentResult.rows.map((payment) => ({
            method: payment.method ?? '',
            amount: this.toOptionalNumber(payment.amount) ?? 0,
            terms: payment.terms ?? '',
            termsDueDate: this.formatToUiDate(payment.termsDueDate),
            status: payment.status ?? 'unpaid',
            paymentDate: this.formatToUiDate(payment.paymentDate),
            bankName: payment.bankName ?? '',
            referenceNo: payment.referenceNo ?? '',
            checkNo: payment.checkNo ?? '',
            chequeDate: this.formatToUiDate(payment.chequeDate),
            issuedBy: payment.issuedBy ?? '',
            downPayment: this.toOptionalNumber(payment.downPayment) ?? 0,
          })),
          productItems: mappedProductItems,
          serialStatuses,
          poLinkedSerialNumbers,
          unresolvedLinkedSerialNumbers: unresolvedSerialsByUnitType,
          createdAt: purchase.createdAt,
          isTransferPO,
          originatingSalesOrder,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load purchase order detail',
      };
    }
  }

  // Helper function to extract just the date portion cleanly
  private formatToUiDate(isoString: string | null): string | null {
    if (!isoString) return null;
    // If it's a full ISO string, split by the 'T' separator to get 'YYYY-MM-DD'
    return isoString.includes('T') ? isoString.split('T')[0] : isoString;
  }

  private isCompletedLikeStatus(status: string | null | undefined): boolean {
    const normalized = String(status ?? '').trim().toLowerCase();
    if (!normalized) return false;

    return [
      'complete',
      'completed',
      'request_completed',
      'request complete',
      'request-completed',
      'request completed',
    ].includes(normalized);
  }

  private async upsertMaterialRecord(
    executor: { query: PoolClient['query'] },
    input: {
      brandId: number | null;
      materialName: string;
      materialCode?: string | null;
      materialUnit: string;
      unitPrice: number;
      sellPrice: number;
      userId?: number | null;
    },
  ): Promise<number> {
    const materialName = String(input.materialName ?? '').trim();
    const materialCode = String(input.materialCode ?? '').trim();
    const materialUnit = String(input.materialUnit ?? '').trim() || 'PCS';
    const unitPrice = Number.isFinite(input.unitPrice) ? input.unitPrice : 0;
    const sellPrice = Number.isFinite(input.sellPrice) ? input.sellPrice : 0;
    const userId = input.userId ?? null;

    if (!materialName) {
      throw new Error('materialName is required when creating/updating materials');
    }

    const lookupResult = materialCode
      ? await executor.query<{ id: string | number }>(
          `SELECT id
           FROM tblmaterials
           WHERE LOWER(TRIM(COALESCE(material_code, ''))) = LOWER(TRIM($1))
           LIMIT 1`,
          [materialCode],
        )
      : await executor.query<{ id: string | number }>(
          `SELECT id
           FROM tblmaterials
           WHERE LOWER(TRIM(COALESCE(material_name, ''))) = LOWER(TRIM($1))
           LIMIT 1`,
          [materialName],
        );

    const existingId = this.toOptionalNumber(lookupResult.rows[0]?.id);

    if (existingId) {
      const updateResult = await executor.query<{ id: string | number }>(
        `UPDATE tblmaterials
         SET brand_id = COALESCE($1, brand_id),
             material_name = $2,
             unit = COALESCE($3, unit),
             unit_price = $4,
             sell_price = $5,
             updated_at = NOW(),
             updated_by = $6
         WHERE id = $7
         RETURNING id`,
        [input.brandId, materialName, materialUnit, unitPrice, sellPrice, userId, existingId],
      );

      const updatedId = this.toOptionalNumber(updateResult.rows[0]?.id);
      if (updatedId) {
        return updatedId;
      }
    }

    try {
      const insertResult = materialCode
        ? await executor.query<{ id: string | number }>(
            `INSERT INTO tblmaterials (brand_id, material_name, material_code, unit, unit_price, sell_price, created_by, updated_at, updated_by)
             VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, NOW(), $7)
             RETURNING id`,
            [input.brandId, materialName, materialCode, materialUnit, unitPrice, sellPrice, userId],
          )
        : await executor.query<{ id: string | number }>(
            `INSERT INTO tblmaterials (brand_id, material_name, unit, unit_price, sell_price, created_by, updated_at, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), $6)
             RETURNING id`,
            [input.brandId, materialName, materialUnit, unitPrice, sellPrice, userId],
          );

      const insertedId = this.toOptionalNumber(insertResult.rows[0]?.id);
      if (insertedId) {
        return insertedId;
      }
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === '23505') {
        const fallbackLookup = materialCode
          ? await executor.query<{ id: string | number }>(
              `SELECT id
               FROM tblmaterials
               WHERE LOWER(TRIM(COALESCE(material_code, ''))) = LOWER(TRIM($1))
               LIMIT 1`,
              [materialCode],
            )
          : await executor.query<{ id: string | number }>(
              `SELECT id
               FROM tblmaterials
               WHERE LOWER(TRIM(COALESCE(material_name, ''))) = LOWER(TRIM($1))
               LIMIT 1`,
              [materialName],
            );

        const fallbackId = this.toOptionalNumber(fallbackLookup.rows[0]?.id);
        if (fallbackId) {
          return fallbackId;
        }
      }

      throw error;
    }

    throw new Error('Failed to create/retrieve material id for ACM item');
  }

  async update(
    id: number,
    updatePurchaseDto: UpdatePurchaseDto,
    userId?: number,
    branchId?: number,
    auditActor?: AuditActorContext,
  ) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid purchase id' };
    }

    if (!updatePurchaseDto || typeof updatePurchaseDto !== 'object') {
      return {
        success: false,
        message:
          'Invalid request body. Ensure JSON object payload is provided to PATCH /purchase/:id.',
      };
    }

    const beforeSnapshot = await this.getPurchaseAuditSnapshot(id);

    const payload = updatePurchaseDto as UpdatePurchaseDto;

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const existingPurchaseResult = await client.query<{
          id: number;
          vendor_id: string | null;
          po_number: string | null;
          total_amount: string | null;
          status: string | null;
          po_type: string | null;
        }>(
          `SELECT
             po.id,
             po.vendor_id::text AS vendor_id,
             po.po_number::text AS po_number,
             po.total_amount::text AS total_amount,
             po.status::text AS status,
             COALESCE(po.po_type, 'ACU')::text AS po_type
           FROM tblpurchase_orders po
           WHERE po.id = $1
           LIMIT 1`,
          [id],
        );

        if (existingPurchaseResult.rowCount === 0) {
          throw new Error(`Purchase order ${id} not found`);
        }

        const existingPurchase = existingPurchaseResult.rows[0];

        // Status guard: reject update if PO status is not editable for ACM type
        // Allow 'in-progress' (normal editing) and 'complete' (admin adjustment)
        const requestedPoType = String(payload.poType ?? '').trim().toUpperCase();
        const existingPoType = this.normalizePoType(existingPurchase.po_type);
        const effectivePoType = requestedPoType || existingPoType;
        const currentStatus = String(existingPurchase.status ?? '').trim().toLowerCase();
        const editableStatuses = ['in-progress', 'in_progress'];
        if (
          effectivePoType === 'ACM' &&
          !editableStatuses.includes(currentStatus) &&
          !this.isCompletedLikeStatus(currentStatus)
        ) {
          throw new BadRequestException(
            `Purchase order cannot be edited in its current status '${currentStatus}'. Only orders with status 'in-progress' or completed-equivalent statuses can be updated.`,
          );
        }

        // Status transition guard: if transitioning to 'for_approval', current status must be 'in-progress'
        const requestedStatus = String(
          payload.purchaseStatus ?? payload.status ?? '',
        ).trim().toLowerCase();
        if (
          (requestedStatus === 'for_approval' || requestedStatus === 'for approval') &&
          currentStatus !== 'in-progress' &&
          currentStatus !== 'in_progress'
        ) {
          throw new BadRequestException(
            `Cannot submit for approval from status '${currentStatus}'. Purchase order must be in 'in-progress' status.`,
          );
        }

        const vendorColumns = await this.getTableColumns(client, 'tblvendors');
        const resolvedVendorId = await this.resolvePurchaseVendor(client, vendorColumns, {
          vendorId: payload.vendorId ?? existingPurchase.vendor_id ?? '',
          vendorName: payload.vendor?.name,
          vendorAddress: payload.vendor?.address,
          contactPerson: payload.vendor?.contact_person,
          contactNumber: payload.vendor?.contact_number,
        });

        if (!resolvedVendorId) {
          throw new Error('Unable to resolve vendorId for purchase update');
        }

        const productItems = Array.isArray(payload.productItems)
          ? payload.productItems
          : [];

        // Validate ACM-specific fields during update (same rules as create DTO)
        if (effectivePoType === 'ACM') {
          // Use the same DTO-level validation as create
          CreatePurchaseDto.validateAcm(payload as unknown as CreatePurchaseDto);
        }

        let computedTotalAmount = 0;
        for (const item of productItems) {
          const itemUnitPrice = this.toOptionalNumber(item.unitPrice) ?? 0;
          const itemDiscountPrice = this.toOptionalNumber(item.discountPrice) ?? 0;
          const priceToUse = itemDiscountPrice > 0 ? itemDiscountPrice : itemUnitPrice;
          const qty = this.toOptionalNumber(item.totalSetQty) ?? 0;
          computedTotalAmount += priceToUse * qty;
        }

        const fallbackTotal =
          this.toOptionalNumber(payload.totalAmount) ??
          this.toOptionalNumber(existingPurchase.total_amount) ??
          0;
        // For ACM type, always use computed total when product items are provided
        const totalAmount =
          productItems.length > 0
            ? computedTotalAmount
            : fallbackTotal;

        const status = String(
          payload.purchaseStatus ?? payload.status ?? existingPurchase.status ?? 'pending',
        ).trim() || 'pending';
        const poNumber = String(payload.poNumber ?? '').trim();

        if (poNumber && poNumber !== (existingPurchase.po_number ?? '').trim()) {
          const duplicatePoResult = await client.query<{ id: number }>(
            `SELECT id
             FROM tblpurchase_orders po
             WHERE LOWER(TRIM(COALESCE(
               to_jsonb(po)->>'po_number',
               to_jsonb(po)->>'poNumber',
               to_jsonb(po)->>'po_no',
               ''
             ))) = LOWER(TRIM($1))
             AND po.id <> $2
             LIMIT 1`,
            [poNumber, id],
          );

          if (duplicatePoResult.rowCount > 0) {
            throw new Error('PO number already exists');
          }
        }

        const purchaseColumns = await this.getTableColumns(client, 'tblpurchase_orders');
        const poNumberColumn = this.pickColumn(purchaseColumns, ['po_number', 'poNumber', 'po_no']);
        const purchaseVendorIdColumn = this.pickColumn(purchaseColumns, ['vendor_id', 'vendorId']);
        const totalAmountColumn = this.pickColumn(purchaseColumns, ['total_amount', 'totalAmount']);
        const statusColumn = this.pickColumn(purchaseColumns, ['status']);

        if (!purchaseVendorIdColumn || !totalAmountColumn || !statusColumn) {
          throw new Error('tblpurchase_orders columns are not aligned with expected fields');
        }

        const purchaseUpdates: string[] = [];
        const purchaseParams: unknown[] = [];

        purchaseParams.push(resolvedVendorId);
        purchaseUpdates.push(`"${purchaseVendorIdColumn}" = $${purchaseParams.length}`);

        purchaseParams.push(totalAmount);
        purchaseUpdates.push(`"${totalAmountColumn}" = $${purchaseParams.length}`);

        purchaseParams.push(status);
        purchaseUpdates.push(`"${statusColumn}" = $${purchaseParams.length}`);

        const poTypeColumn = this.pickColumn(purchaseColumns, ['po_type', 'poType', 'poType']);
        if (poTypeColumn) {
          const poType = String(payload.poType ?? existingPurchase.po_type ?? 'ACU').trim().toUpperCase();
          if (['ACU', 'ACP', 'ACM'].includes(poType)) {
            purchaseParams.push(poType);
            purchaseUpdates.push(`"${poTypeColumn}" = $${purchaseParams.length}`);
          }
        }

        if (poNumberColumn && poNumber) {
          purchaseParams.push(poNumber);
          purchaseUpdates.push(`"${poNumberColumn}" = $${purchaseParams.length}`);
        }

        purchaseParams.push(id);
        await client.query(
          `UPDATE tblpurchase_orders
           SET ${purchaseUpdates.join(', ')}
           WHERE id = $${purchaseParams.length}`,
          purchaseParams,
        );

        const paymentDetailsInput = payload.paymentDetails;
        const paymentDetailsList = Array.isArray(paymentDetailsInput)
          ? paymentDetailsInput
          : paymentDetailsInput
            ? [paymentDetailsInput]
            : [];

        if (paymentDetailsList.length > 0) {
          const paymentColumns = await this.getTableColumns(client, 'tblpo_payments');
          const paymentPoIdColumn = this.pickColumn(paymentColumns, [
            'po_id',
            'poId',
            'purchase_id',
            'purchaseId',
            'purchase_order_id',
            'purchaseOrderId',
          ]);
          const amountColumn = this.pickColumn(paymentColumns, [
            'amount',
            'payment_amount',
            'paymentAmount',
          ]);
          const methodColumn = this.pickColumn(paymentColumns, ['method']);
          const paymentDateColumn = this.pickColumn(paymentColumns, ['payment_date', 'paymentDate']);
          const bankNameColumn = this.pickColumn(paymentColumns, ['bank_name', 'bankName']);
          const referenceNoColumn = this.pickColumn(paymentColumns, ['reference_no', 'referenceNo']);
          const checkNoColumn = this.pickColumn(paymentColumns, ['check_no', 'checkNo']);
          const chequeDateColumn = this.pickColumn(paymentColumns, [
            'cheque_date',
            'chequeDate',
            'post_dated',
            'postDated',
          ]);
          const issuedByColumn = this.pickColumn(paymentColumns, ['issued_by', 'issuedBy']);
          const termsColumn = this.pickColumn(paymentColumns, ['terms']);
          const termsDueDateColumn = this.pickColumn(paymentColumns, ['terms_due_date', 'termsDueDate']);
          const paymentStatusColumn = this.pickColumn(paymentColumns, ['status']);
          const downPaymentColumn = this.pickColumn(paymentColumns, ['down_payment', 'downPayment']);

          if (paymentPoIdColumn) {
            await client.query(
              `DELETE FROM tblpo_payments pp
               WHERE COALESCE(
                 to_jsonb(pp)->>'po_id',
                 to_jsonb(pp)->>'poId',
                 to_jsonb(pp)->>'purchase_id',
                 to_jsonb(pp)->>'purchaseId',
                 to_jsonb(pp)->>'purchase_order_id',
                 to_jsonb(pp)->>'purchaseOrderId'
               ) = $1`,
              [String(id)],
            );

            for (const [paymentIndex, paymentDetails] of paymentDetailsList.entries()) {
              if (!paymentDetails || typeof paymentDetails !== 'object') {
                throw new BadRequestException(`paymentDetails[${paymentIndex}] must be an object`);
              }

              const paymentPayload = paymentDetails as Record<string, unknown>;
              const method = this.validatePurchasePaymentDetails(paymentPayload, paymentIndex);

              const downPayment = this.toOptionalNumber(paymentPayload.downPayment);
              const providedPaymentAmount = this.toOptionalNumber(paymentPayload.amount);
              const resolvedTermsDueDate = this.deriveTermsDueDate(paymentPayload, method);
              const paymentStatus = this.resolvePaymentStatusForDisplay(
                method,
                paymentPayload.status ?? this.getAutoPaymentStatus(method),
                resolvedTermsDueDate,
                paymentPayload.chequeDate,
              );
              const fallbackPaymentAmount =
                paymentStatus === 'paid' ? totalAmount : downPayment ?? 0;
              const paymentAmount =
                providedPaymentAmount !== null
                  ? providedPaymentAmount
                  : fallbackPaymentAmount;

              const paymentRecord: Record<string, unknown> = {
                [paymentPoIdColumn]: id,
              };

              if (amountColumn) {
                paymentRecord[amountColumn] = paymentAmount;
              }
              if (methodColumn) {
                paymentRecord[methodColumn] = method;
              }

              const paymentDate = this.toIsoDateOrNull(paymentPayload.paymentDate);
              if (paymentDateColumn && paymentDate) {
                paymentRecord[paymentDateColumn] = paymentDate;
              }
              if (bankNameColumn && paymentPayload.bankName) {
                paymentRecord[bankNameColumn] = String(paymentPayload.bankName).trim();
              }
              if (referenceNoColumn && paymentPayload.referenceNo) {
                paymentRecord[referenceNoColumn] = String(paymentPayload.referenceNo).trim();
              }
              if (checkNoColumn && paymentPayload.checkNo) {
                paymentRecord[checkNoColumn] = String(paymentPayload.checkNo).trim();
              }
              const chequeDate = this.toIsoDateOrNull(paymentPayload.chequeDate);
              if (chequeDateColumn && chequeDate) {
                paymentRecord[chequeDateColumn] = chequeDate;
              }
              if (issuedByColumn && paymentPayload.issuedBy) {
                paymentRecord[issuedByColumn] = String(paymentPayload.issuedBy).trim();
              }

              if (termsColumn && paymentPayload.terms) {
                paymentRecord[termsColumn] = String(paymentPayload.terms).trim();
              }

              if (termsDueDateColumn && resolvedTermsDueDate) {
                paymentRecord[termsDueDateColumn] = resolvedTermsDueDate;
              }

              if (paymentStatusColumn) {
                paymentRecord[paymentStatusColumn] = paymentStatus;
              }

              if (downPaymentColumn && downPayment !== null) {
                paymentRecord[downPaymentColumn] = downPayment;
              }

              await this.runInsert(client, 'tblpo_payments', paymentRecord);
            }
          }
        }

        if (productItems.length > 0) {
          const poRes = await client.query(
            `SELECT COALESCE(
               po.po_type,
               to_jsonb(po)->>'poType',
               to_jsonb(po)->>'po_type',
               'ACU'
             ) AS po_type
             FROM tblpurchase_orders po
             WHERE po.id = $1`,
            [id],
          );
          const poType = this.normalizePoType(poRes.rows[0]?.po_type);
          let itemsTable = 'tbltransaction_product_items';
          if (poType === 'ACP') itemsTable = 'tbltransaction_parts_items';
          else if (poType === 'ACM') itemsTable = 'tbltransaction_material_items';

          const transactionItemColumns = await this.getTableColumns(
            client,
            itemsTable,
          );

          const transTypeColumn = this.pickColumn(transactionItemColumns, [
            'transType',
            'trans_type',
          ]);
          const productIdColumn = this.pickColumn(transactionItemColumns, [
            'productId',
            'product_id',
            'part_id',
            'material_id',
          ]);
          const capacityIdColumn = this.pickColumn(transactionItemColumns, [
            'capacityId',
            'capacity_id',
          ]);
          const unitPriceColumn = this.pickColumn(transactionItemColumns, [
            'unitPrice',
            'unit_price',
          ]);
          const sellPriceColumn = this.pickColumn(transactionItemColumns, [
            'sellPrice',
            'sell_price',
          ]);
          const discountPriceColumn = this.pickColumn(transactionItemColumns, [
            'discountPrice',
            'discount_price',
          ]);
          const unitTypesQtyColumn = this.pickColumn(transactionItemColumns, [
            'unitTypesQty',
            'unit_types_qty',
          ]);
          const totalSetQtyColumn = this.pickColumn(transactionItemColumns, [
            'totalSetQty',
            'total_set_qty',
            'quantity',
          ]);
          const purchaseIdColumn = this.pickColumn(transactionItemColumns, [
            'purchaseId',
            'purchase_id',
            'po_id',
          ]);
          const salesIdColumn = this.pickColumn(transactionItemColumns, [
            'salesId',
            'sales_id',
          ]);
          const itemStatusColumn = this.pickColumn(transactionItemColumns, ['status']);
          const itemCreatedByColumn = this.pickColumn(transactionItemColumns, [
            'created_by',
            'createdBy',
            'createdby',
          ]);
          const unitTypesQtyMeta = unitTypesQtyColumn
            ? await this.getColumnMeta(
                client,
                itemsTable,
                unitTypesQtyColumn,
              )
            : null;

          // ─── ACM Stock Adjustment: capture old quantities before deleting items ───
          const oldMaterialQtys = new Map<number, number>();
          if (poType === 'ACM' && this.isCompletedLikeStatus(currentStatus)) {
            try {
              const oldItemsResult = await client.query<{ material_id: string; quantity: string }>(
                `SELECT material_id::text AS material_id, COALESCE(quantity, 0)::text AS quantity
                 FROM ${itemsTable}
                 WHERE purchase_id = $1 OR
                   COALESCE(to_jsonb(${itemsTable})->>'purchaseId', to_jsonb(${itemsTable})->>'purchase_id', to_jsonb(${itemsTable})->>'po_id') = $2`,
                [id, String(id)],
              );
              for (const row of oldItemsResult.rows) {
                const matId = Number(row.material_id);
                const qty = Number(row.quantity);
                if (matId > 0 && qty > 0) {
                  oldMaterialQtys.set(matId, (oldMaterialQtys.get(matId) ?? 0) + qty);
                }
              }
            } catch (oldItemsErr: any) {
              // If the query fails, try a simpler approach
              try {
                const fallbackResult = await client.query<{ material_id: string; quantity: string }>(
                  `SELECT material_id::text, COALESCE(quantity, 0)::text AS quantity
                   FROM tbltransaction_material_items
                   WHERE purchase_id = $1`,
                  [id],
                );
                for (const row of fallbackResult.rows) {
                  const matId = Number(row.material_id);
                  const qty = Number(row.quantity);
                  if (matId > 0 && qty > 0) {
                    oldMaterialQtys.set(matId, (oldMaterialQtys.get(matId) ?? 0) + qty);
                  }
                }
              } catch {
                // Can't capture old quantities — skip adjustment
                console.warn('Could not capture old PO quantities for adjustment');
              }
            }
          }

          await client.query(
            `DELETE FROM ${itemsTable}
             WHERE COALESCE(
               to_jsonb(${itemsTable})->>'purchaseId',
               to_jsonb(${itemsTable})->>'purchase_id',
               to_jsonb(${itemsTable})->>'po_id'
             ) = $1
             AND LOWER(COALESCE(
               to_jsonb(${itemsTable})->>'transType',
               to_jsonb(${itemsTable})->>'trans_type',
               'purchase'
             )) = 'purchase'`,
            [String(id)],
          );

          const serialColumns = await this.getTableColumns(client, 'tblserial_numbers');
          const serialBranchIdColumn = this.pickColumn(serialColumns, ['branchId', 'branch_id']);
          const serialVendorIdColumn = this.pickColumn(serialColumns, ['vendorId', 'vendor_id']);
          const serialPurchaseIdColumn = this.pickColumn(serialColumns, [
            'purchaseId',
            'purchase_id',
          ]);
          const serialSalesIdColumn = this.pickColumn(serialColumns, ['salesId', 'sales_id']);
          const serialProductIdColumn = this.pickColumn(serialColumns, [
            'productId',
            'product_id',
          ]);
          const serialCapacityIdColumn = this.pickColumn(serialColumns, [
            'capacityId',
            'capacity_id',
          ]);
          const serialNumberColumn = this.pickColumn(serialColumns, [
            'serialNumber',
            'serial_number',
          ]);
          const serialUnitTypeColumn = this.pickColumn(serialColumns, ['unitType', 'unit_type']);
          const serialStatusColumn = this.pickColumn(serialColumns, ['status']);
          const serialCreatedByColumn = this.pickColumn(serialColumns, [
            'created_by',
            'createdBy',
            'createdby',
          ]);

          for (const item of productItems) {
            const transType = String(item.transType ?? 'purchase').trim().toLowerCase();
            if (transType !== 'purchase') {
              continue;
            }

            const isProductItems = itemsTable === 'tbltransaction_product_items';
            const isPartsItems = itemsTable === 'tbltransaction_parts_items';
            const isMaterialItems = itemsTable === 'tbltransaction_material_items';

            let resolvedProductOrPartOrMaterialId: number | null = null;
            let resolvedCapacityId: number | null = null;

            if (isProductItems) {
              const productId = this.toOptionalNumber(item.productId);
              const capacityId = this.toOptionalNumber(item.capacityId);
              if (productId === null || capacityId === null) {
                throw new Error('productId and capacityId are required for ACU purchase items');
              }

              const productExistsResult = await client.query<{ id: string | number }>(
                `SELECT id FROM tblproducts WHERE id::text = $1 LIMIT 1`,
                [String(productId)],
              );
              if (productExistsResult.rowCount === 0) {
                throw new Error(`Product ID ${productId} does not exist in tblproducts`);
              }

              const capacityExistsResult = await client.query<{ id: string | number }>(
                `SELECT id FROM tblcapacity WHERE id::text = $1 LIMIT 1`,
                [String(capacityId)],
              );
              if (capacityExistsResult.rowCount === 0) {
                throw new Error(`Capacity ID ${capacityId} does not exist in tblcapacity`);
              }

              resolvedProductOrPartOrMaterialId = productId;
              resolvedCapacityId = capacityId;
            } else if (isPartsItems) {
              let partId = this.toOptionalNumber((item as any).partId ?? item.productId);
              if (!partId) {
                const partsName = String((item as any).partsName ?? (item as any).partName ?? '').trim();
                if (!partsName) {
                  throw new Error('partId or partsName is required for ACP items');
                }
                // Look up by name
                const partLookup = await client.query<{ id: string | number }>(
                  `SELECT id FROM tblparts WHERE LOWER(TRIM(parts_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL LIMIT 1`,
                  [partsName],
                );
                partId = this.toOptionalNumber(partLookup.rows[0]?.id);
                if (!partId) {
                  throw new Error(`Part '${partsName}' not found in tblparts`);
                }
              }
              resolvedProductOrPartOrMaterialId = partId;
            } else if (isMaterialItems) {
              let materialId = this.toOptionalNumber((item as any).materialId ?? item.productId);

              if (!materialId) {
                const materialName = String((item as any).materialName ?? '').trim();
                const materialCode = String((item as any).materialCode ?? '').trim();
                const materialUnit = String((item as any).materialUnit ?? '').trim() || 'PCS';
                let brandId = this.toOptionalNumber(
                  (item as any).materialBrandId ?? (item as any).brandId ?? (item as any).brand_id,
                );
                const brandName = String(
                  (item as any).materialBrandName ?? (item as any).brandName ?? '',
                ).trim();

                if (!brandId && brandName) {
                  const brandLookupResult = await client.query<{ id: string | number }>(
                    `SELECT id FROM tblbrands WHERE LOWER(TRIM(COALESCE("brandName", ''))) = LOWER(TRIM($1)) LIMIT 1`,
                    [brandName],
                  );
                  brandId = this.toOptionalNumber(brandLookupResult.rows[0]?.id);
                  if (!brandId) {
                    const insertBrandResult = await client.query<{ id: string | number }>(
                      `INSERT INTO tblbrands ("brandName", type, created_at) VALUES ($1, 'MAT', NOW()) ON CONFLICT DO NOTHING RETURNING id`,
                      [brandName],
                    );
                    brandId = this.toOptionalNumber(insertBrandResult.rows[0]?.id);
                    if (!brandId) {
                      const reLookup = await client.query<{ id: string | number }>(
                        `SELECT id FROM tblbrands WHERE LOWER(TRIM(COALESCE("brandName", ''))) = LOWER(TRIM($1)) LIMIT 1`,
                        [brandName],
                      );
                      brandId = this.toOptionalNumber(reLookup.rows[0]?.id);
                    }
                  }
                }

                if (!materialName) {
                  throw new Error('materialName is required for ACM items when material id is not provided');
                }

                const unitPrice = this.toOptionalNumber(item.unitPrice) ?? 0;
                const sellPrice = this.toOptionalNumber(item.sellPrice) ?? 0;

                materialId = await this.upsertMaterialRecord(client, {
                  brandId,
                  materialName,
                  materialCode,
                  materialUnit,
                  unitPrice,
                  sellPrice,
                  userId: userId ?? null,
                });

                if (!materialId) {
                  throw new Error('Failed to create/retrieve material id for ACM item');
                }
              }

              resolvedProductOrPartOrMaterialId = materialId;
            }

            const unitTypesQty = Array.isArray(item.unitTypesQty) ? item.unitTypesQty : [];
            const qtyFromList = unitTypesQty.reduce((sum, current) => {
              const parsedQty = this.toOptionalNumber(current.qty ?? current.value) ?? 0;
              return sum + (parsedQty > 0 ? parsedQty : 0);
            }, 0);
            const fallbackTotalQty = this.toOptionalNumber(item.totalSetQty) ?? 0;
            const totalQty = qtyFromList > 0 ? qtyFromList : fallbackTotalQty;

            const itemRecord: Record<string, unknown> = {};
            if (transTypeColumn) {
              itemRecord[transTypeColumn] = transType;
            }
            if (productIdColumn && resolvedProductOrPartOrMaterialId !== null) {
              itemRecord[productIdColumn] = resolvedProductOrPartOrMaterialId;
            }
            if (capacityIdColumn && resolvedCapacityId !== null) {
              itemRecord[capacityIdColumn] = resolvedCapacityId;
            }
            if (unitPriceColumn) {
              itemRecord[unitPriceColumn] = this.toOptionalNumber(item.unitPrice) ?? 0;
            }
            if (sellPriceColumn) {
              itemRecord[sellPriceColumn] = this.toOptionalNumber(item.sellPrice) ?? 0;
            }
            if (discountPriceColumn) {
              itemRecord[discountPriceColumn] = this.toOptionalNumber(item.discountPrice) ?? 0;
            }

            if (unitTypesQtyColumn) {
              const normalizedUnitTypesQty = unitTypesQty.map((entry) => ({
                label: String(entry.label ?? entry.unitType ?? 'set').trim() || 'set',
                value: this.toOptionalNumber(entry.value ?? entry.qty) ?? 0,
              }));

              if (
                unitTypesQtyMeta &&
                (unitTypesQtyMeta.data_type === 'ARRAY' ||
                  unitTypesQtyMeta.udt_name.startsWith('_'))
              ) {
                itemRecord[unitTypesQtyColumn] = normalizedUnitTypesQty.map(
                  (entry) => `${entry.label}:${entry.value}`,
                );
              } else {
                itemRecord[unitTypesQtyColumn] = JSON.stringify(normalizedUnitTypesQty);
              }
            }

            if (totalSetQtyColumn) {
              itemRecord[totalSetQtyColumn] = totalQty;
            }
            if (purchaseIdColumn) {
              itemRecord[purchaseIdColumn] = id;
            }
            if (salesIdColumn) {
              itemRecord[salesIdColumn] = this.toOptionalNumber(item.salesId);
            }
            if (itemStatusColumn) {
              itemRecord[itemStatusColumn] = 'pending';
            }
            if (itemCreatedByColumn && userId) {
              itemRecord[itemCreatedByColumn] = userId;
            }

            if (Object.keys(itemRecord).length > 0) {
              await this.runInsert(client, itemsTable, itemRecord);
            }

            const serialPayload =
              item.serialNumbers && typeof item.serialNumbers === 'object'
                ? (item.serialNumbers as Record<string, unknown>)
                : {};

            // Determine default serial status: if PO is already approved/awaiting_delivery,
            // new scanned serials should be marked as in-stock. Otherwise use provided status or 'scanned'.
            let serialStatus = String(serialPayload.status ?? '').trim().toLowerCase();
            if (!serialStatus) {
              const normalizedPoStatus = String(status ?? existingPurchase.status ?? '').trim().toLowerCase();
              if (['approved', 'awaiting_delivery', 'awaiting-delivery', 'awaiting delivery', 'received'].includes(normalizedPoStatus)) {
                serialStatus = 'in-stock';
              } else {
                serialStatus = 'scanned';
              }
            }

            for (const [unitTypeKey, values] of Object.entries(serialPayload)) {
              if (unitTypeKey.toLowerCase() === 'status') {
                continue;
              }

              const serialList = Array.isArray(values) ? values : [];

              for (const serialRaw of serialList) {
                const normalizedSerial = this.normalizeSerialNumber(serialRaw);
                if (!normalizedSerial || !serialNumberColumn) {
                  continue;
                }

                const existingSerialResult = await client.query<{
                  id: number;
                  purchase_id: string | null;
                  status: string | null;
                }>(
                  `SELECT
                     sn.id,
                     sn."purchaseId"::text AS purchase_id,
                     COALESCE(sn."status"::text, '') AS status
                   FROM tblserial_numbers sn
                   WHERE LOWER(
                     regexp_replace(BTRIM(COALESCE(sn."serialNumber", '')), '\\s+', ' ', 'g')
                   ) = LOWER($1)
                   LIMIT 1`,
                  [normalizedSerial],
                );

                const serialRecord: Record<string, unknown> = {};
                if (serialBranchIdColumn && branchId) {
                  serialRecord[serialBranchIdColumn] = branchId;
                }
                if (serialVendorIdColumn) {
                  serialRecord[serialVendorIdColumn] = resolvedVendorId;
                }
                if (serialPurchaseIdColumn) {
                  serialRecord[serialPurchaseIdColumn] = id;
                }
                if (serialSalesIdColumn) {
                  serialRecord[serialSalesIdColumn] = null;
                }
                if (serialProductIdColumn) {
                  serialRecord[serialProductIdColumn] = resolvedProductOrPartOrMaterialId;
                }
                if (serialCapacityIdColumn) {
                  serialRecord[serialCapacityIdColumn] = resolvedCapacityId;
                }
                serialRecord[serialNumberColumn] = normalizedSerial;
                if (serialUnitTypeColumn) {
                  serialRecord[serialUnitTypeColumn] = unitTypeKey;
                }
                if (serialStatusColumn) {
                  serialRecord[serialStatusColumn] = serialStatus;
                }
                if (serialCreatedByColumn && userId) {
                  serialRecord[serialCreatedByColumn] = userId;
                }

                if (existingSerialResult.rowCount > 0) {
                  const existingSerial = existingSerialResult.rows[0];
                  if (
                    existingSerial.purchase_id &&
                    Number(existingSerial.purchase_id) !== id
                  ) {
                    throw new Error(
                      `Serial number ${normalizedSerial} is already linked to purchase ${existingSerial.purchase_id}`,
                    );
                  }

                  if (String(existingSerial.status ?? '').trim().toLowerCase() === 'installed') {
                    continue;
                  }

                  const updateColumns = Object.keys(serialRecord);
                  const updateValues = Object.values(serialRecord);
                  const setClause = updateColumns
                    .map((column, idx) => `"${column}" = $${idx + 1}`)
                    .join(', ');

                  await client.query(
                    `UPDATE tblserial_numbers
                     SET ${setClause}
                     WHERE id = $${updateValues.length + 1}`,
                    [...updateValues, existingSerial.id],
                  );
                } else {
                  await this.runInsert(client, 'tblserial_numbers', serialRecord);
                }
              }
            }
          }

          // ─── ACM Stock Adjustment: compare old vs new quantities and adjust stock ───
          if (poType === 'ACM' && oldMaterialQtys.size > 0) {
            // Read NEW quantities from the DB (after items were re-inserted above)
            let newItemsRows: Array<{ material_id: string; quantity: string; unit_price: string; sell_price: string }> = [];
            try {
              const newItemsResult = await client.query<{ material_id: string; quantity: string; unit_price: string; sell_price: string }>(
                `SELECT material_id::text, COALESCE(quantity, 0)::text AS quantity,
                   COALESCE(unit_price, 0)::text AS unit_price, COALESCE(sell_price, 0)::text AS sell_price
                 FROM tbltransaction_material_items
                 WHERE purchase_id = $1`,
                [id],
              );
              newItemsRows = newItemsResult.rows;
            } catch {
              // If query fails, skip adjustment
            }

            const newMaterialQtys = new Map<number, number>();
            const newMaterialPrices = new Map<number, { unitPrice: number; sellPrice: number }>();
            for (const row of newItemsRows) {
              const matId = Number(row.material_id);
              const qty = Number(row.quantity);
              if (matId > 0) {
                newMaterialQtys.set(matId, (newMaterialQtys.get(matId) ?? 0) + qty);
                newMaterialPrices.set(matId, {
                  unitPrice: Number(row.unit_price) || 0,
                  sellPrice: Number(row.sell_price) || 0,
                });
              }
            }

            // Calculate and apply differences
            const allMaterialIds = new Set([...oldMaterialQtys.keys(), ...newMaterialQtys.keys()]);
            for (const matId of allMaterialIds) {
              const oldQty = oldMaterialQtys.get(matId) ?? 0;
              const newQty = newMaterialQtys.get(matId) ?? 0;
              const diff = newQty - oldQty;

              // Skip if no quantity change
              if (diff === 0) continue;

              // Update on_hand_stock
              await client.query(
                `UPDATE tblmaterials
                 SET on_hand_stock = GREATEST(COALESCE(on_hand_stock, 0) + $1, 0), updated_at = NOW()
                 WHERE id = $2`,
                [diff, matId],
              );

              // Record stock movement for the adjustment
              try {
                await this.materialStockService.recordMovement({
                  materialId: matId,
                  qty: Math.abs(diff),
                  movementType: 'ADJUST',
                  sourceType: 'PO',
                  sourceId: id,
                  sourceLineKey: `PO-${id}-ADJ-${matId}-${Date.now()}`,
                  statusSnapshot: 'po-adjustment',
                  remarks: `PO #${id} adjustment: ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(diff)} units`,
                }, { client });
              } catch (moveErr: any) {
                if (!moveErr?.message?.includes('unique') && !moveErr?.message?.includes('duplicate')) {
                  console.warn('PO stock adjustment movement error:', moveErr?.message?.slice(0, 200));
                }
              }
            }

            // Update material prices only if they changed
            for (const matId of newMaterialQtys.keys()) {
              const prices = newMaterialPrices.get(matId);
              if (!prices) continue;

              // Get current material prices
              const currentPrices = await client.query<{ unit_price: string; sell_price: string }>(
                `SELECT unit_price::text, sell_price::text FROM tblmaterials WHERE id = $1`,
                [matId],
              );
              if (currentPrices.rows.length === 0) continue;

              const currentUnitPrice = Number(currentPrices.rows[0].unit_price) || 0;
              const currentSellPrice = Number(currentPrices.rows[0].sell_price) || 0;
              const newUnitPrice = prices.unitPrice;
              const newSellPrice = prices.sellPrice;

              // Only update and record history if prices actually changed
              if (newUnitPrice !== currentUnitPrice || newSellPrice !== currentSellPrice) {
                const updateParts: string[] = ['updated_at = NOW()'];
                const updateVals: unknown[] = [];

                if (newUnitPrice > 0 && newUnitPrice !== currentUnitPrice) {
                  updateVals.push(newUnitPrice);
                  updateParts.push(`unit_price = $${updateVals.length}`);
                }
                if (newSellPrice > 0 && newSellPrice !== currentSellPrice) {
                  updateVals.push(newSellPrice);
                  updateParts.push(`sell_price = $${updateVals.length}`);
                }

                if (updateVals.length > 0) {
                  updateVals.push(matId);
                  await client.query(
                    `UPDATE tblmaterials SET ${updateParts.join(', ')} WHERE id = $${updateVals.length}`,
                    updateVals,
                  );

                  // Record price history
                  try {
                    await client.query(
                      `INSERT INTO tblmaterial_price_history (material_id, unit_price, sell_price, created_by)
                       VALUES ($1, $2, $3, $4)`,
                      [matId, newUnitPrice || currentUnitPrice, newSellPrice || currentSellPrice, userId ?? null],
                    );
                  } catch {
                    // Non-fatal
                  }
                }
              }
            }
          }
        }

        return {
          purchaseOrderId: id,
          vendorId: resolvedVendorId,
          totalAmount,
        };
      });

      const afterSnapshot = await this.getPurchaseAuditSnapshot(id);
      const auditInfo = this.resolvePurchaseUpdateAuditAction(beforeSnapshot, afterSnapshot);
      await this.auditLogService.logMutation({
        action: auditInfo.action,
        entityType: 'purchase-order',
        entityId: id,
        actor: auditActor ?? { userId, branchId },
        description: auditInfo.description,
        requestBody: updatePurchaseDto as Record<string, unknown>,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      return {
        success: true,
        message: 'Purchase order updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update purchase order',
      };
    }
  }

  remove(id: number) {
    return `This action removes a #${id} purchase`;
  }

  async cancelPurchase(
    id: number,
    context?: { userId?: number; username?: string; roleName?: string; branchId?: number },
  ): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const poResult = await client.query<{ status: string | null }>(
          `SELECT status FROM tblpurchase_orders WHERE id = $1 LIMIT 1`,
          [id],
        );

        if (poResult.rows.length === 0) {
          throw new Error('Purchase order not found');
        }

        const currentStatus = String(poResult.rows[0].status ?? '').trim().toLowerCase();
        const nonCancellable = ['approved', 'completed', 'cancelled'];
        if (nonCancellable.includes(currentStatus)) {
          throw new Error(
            `Cannot cancel a purchase order with status '${currentStatus}'`,
          );
        }

        const serialColumns = await this.getTableColumns(client, 'tblserial_numbers');
        const serialPurchaseIdColumn = this.pickColumn(serialColumns, [
          'purchaseId',
          'purchase_id',
        ]);

        if (serialPurchaseIdColumn) {
          await client.query(
            `DELETE FROM tblserial_numbers WHERE "${serialPurchaseIdColumn}" = $1`,
            [id],
          );
        }

        await client.query(
          `UPDATE tblpurchase_orders SET status = 'cancelled' WHERE id = $1`,
          [id],
        );

        return { id };
      });

      this.auditLogService.log({
        action: 'PURCHASE_CANCEL',
        entityType: 'purchase_order',
        entityId: String(result.id),
        userId: context?.userId,
        username: context?.username,
        roleName: context?.roleName,
        branchId: context?.branchId,
        metadata: { poId: result.id },
      });

      return {
        success: true,
        message: `Purchase order #${result.id} has been cancelled`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to cancel purchase order',
      };
    }
  }

  async deletePurchaseWithAuth(
    id: number,
    userId: number,
    roleName: string,
    username: string,
    password: string,
    authUsername?: string,
    branchId?: number,
  ): Promise<{ success: boolean; message: string }> {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid purchase order id' };
    }

    const normalizedPassword = String(password ?? '').trim();
    if (!normalizedPassword) {
      return { success: false, message: 'Password is required to delete a purchase order' };
    }

    const normalizedRole = String(roleName ?? '').trim().toLowerCase();
    const isAdmin =
      normalizedRole.includes('admin') ||
      normalizedRole.includes('super') ||
      normalizedRole.includes('owner');

    const passwordSha1 = createHash('sha1').update(normalizedPassword).digest('hex');

    if (isAdmin) {
      const effectiveUserId = Number(userId);
      if (!Number.isFinite(effectiveUserId) || effectiveUserId <= 0) {
        return { success: false, message: 'Invalid current user' };
      }

      const adminCheck = await this.databaseService.query<{ id: number }>(
        `SELECT u.id
         FROM tblusers u
         WHERE u.id = $1
           AND u.password = $2
         LIMIT 1`,
        [effectiveUserId, passwordSha1],
      );

      if (adminCheck.rowCount === 0) {
        return { success: false, message: 'Incorrect password. Please try again.' };
      }
    } else {
      const normalizedAuthUsername = String(authUsername ?? '').trim();
      if (!normalizedAuthUsername) {
        return { success: false, message: 'Admin username is required to authorize this deletion' };
      }

      const adminCheck = await this.databaseService.query<{ id: number }>(
        `SELECT u.id
         FROM tblusers u
         LEFT JOIN tblrbac r
           ON r.id::text = COALESCE(
             to_jsonb(u)->>'roleId',
             to_jsonb(u)->>'roleid',
             to_jsonb(u)->>'role_id'
           )
         WHERE LOWER(TRIM(COALESCE(to_jsonb(u)->>'username', ''))) = LOWER(TRIM($1))
           AND u.password = $2
           AND (
             LOWER(COALESCE(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%admin%'
             OR LOWER(COALESCE(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%super%'
             OR LOWER(COALESCE(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%owner%'
           )
         LIMIT 1`,
        [normalizedAuthUsername, passwordSha1],
      );

      if (adminCheck.rowCount === 0) {
        return { success: false, message: 'Invalid admin credentials. Authorization denied.' };
      }
    }

    const result = await this.deletePurchase(id);

    if (result.success) {
      this.auditLogService.log({
        action: 'PURCHASE_DELETE',
        entityType: 'purchase_order',
        entityId: String(id),
        userId,
        username,
        roleName,
        branchId,
        metadata: {
          poId: id,
          authorizedBy: isAdmin ? username : String(authUsername ?? '').trim(),
          authMethod: isAdmin ? 'self' : 'admin_delegate',
        },
      });
    }

    return result;
  }

  async deletePurchase(id: number): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const poResult = await client.query<{ status: string | null; po_number: string | null; po_type: string | null }>(
          `SELECT
             status,
             po_number,
             COALESCE(
               po.po_type,
               to_jsonb(po)->>'poType',
               to_jsonb(po)->>'po_type',
               'ACU'
             ) as po_type
           FROM tblpurchase_orders po
           WHERE po.id = $1
           LIMIT 1`,
          [id],
        );

        if (poResult.rows.length === 0) {
          throw new Error('Purchase order not found');
        }

        const poType = this.normalizePoType(poResult.rows[0].po_type);
        let itemsTable = 'tbltransaction_product_items';
        if (poType === 'ACP') itemsTable = 'tbltransaction_parts_items';
        else if (poType === 'ACM') itemsTable = 'tbltransaction_material_items';

        const currentStatus = String(poResult.rows[0].status ?? '').trim().toLowerCase();
        const nonDeletable = ['approved', 'completed'];
        if (nonDeletable.includes(currentStatus)) {
          throw new Error(
            `Cannot delete a purchase order with status '${currentStatus}'. Only pending, in-progress, for-approval, or cancelled POs can be deleted.`,
          );
        }

        const poNumber = poResult.rows[0].po_number ?? String(id);

        const serialColumns = await this.getTableColumns(client, 'tblserial_numbers');
        const serialPurchaseIdColumn = this.pickColumn(serialColumns, [
          'purchaseId',
          'purchase_id',
        ]);

        if (serialPurchaseIdColumn) {
          await client.query(
            `DELETE FROM tblserial_numbers WHERE "${serialPurchaseIdColumn}" = $1`,
            [id],
          );
        }

        const transItemColumns = await this.getTableColumns(client, itemsTable);
        const itemPurchaseIdColumn = this.pickColumn(transItemColumns, [
          'purchaseId',
          'purchase_id',
        ]);

        if (itemPurchaseIdColumn) {
          await client.query(
            `DELETE FROM ${itemsTable} WHERE "${itemPurchaseIdColumn}" = $1`,
            [id],
          );
        }

        // Delete payments - use dynamic column lookup for robustness
        const paymentColumns = await this.getTableColumns(client, 'tblpo_payments');
        const paymentPoIdColumn = this.pickColumn(paymentColumns, [
          'po_id',
          'poId',
          'purchase_id',
          'purchaseId',
          'purchase_order_id',
          'purchaseOrderId',
        ]);
        if (paymentPoIdColumn) {
          await client.query(
            `DELETE FROM tblpo_payments WHERE "${paymentPoIdColumn}" = $1`,
            [id],
          );
        }

        await client.query(`DELETE FROM tblpurchase_orders WHERE id = $1`, [id]);

        return { id, poNumber };
      });

      return {
        success: true,
        message: `Purchase order ${result.poNumber} has been permanently deleted`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete purchase order',
      };
    }
  }

  private async fetchByMode(
    mode: PurchaseMode,
    query: ListPurchaseQueryDto,
  ): Promise<PurchaseListResponseDto> {
    const page = this.normalizePage(query.page);
    const limit = this.normalizeLimit(query.limit);
    const offset = (page - 1) * limit;
    const search = (query.search ?? '').trim().toLowerCase();
    const branchId = Number(query.branchId);
    const createdBy = Number(query.createdBy);
    const poType = String(query.po_type ?? '').trim().toUpperCase();

    const params: unknown[] = [];
    const whereParts: string[] = [];

    // Filter by po_type if provided (e.g. 'ACM')
    if (poType && ['ACU', 'ACP', 'ACM'].includes(poType)) {
      params.push(poType);
      whereParts.push(`UPPER(COALESCE(base.po_type, 'ACU')) = $${params.length}`);
    }

    if (mode === 'deliveries') {
      whereParts.push(`LOWER(COALESCE(base.original_status, '')) NOT IN (
        'for_approval', 'for approval', 'approval', 'completed', 'cancelled', 'rejected', 'transfer_received'
      )`);
    } else if (mode === 'approvals') {
      whereParts.push(`LOWER(COALESCE(base.original_status, '')) IN (
        'for_approval', 'for approval', 'approval', 'pending_approval', 'pending approval'
      )`);
    }

    if (Number.isFinite(createdBy) && createdBy > 0) {
      params.push(String(createdBy));
      const idx = params.length;
      whereParts.push(`COALESCE(base.created_by, '')::text = $${idx}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const searchIndex = params.length;
      whereParts.push(`(
        LOWER(COALESCE(base.po_number, '')) LIKE $${searchIndex}
        OR LOWER(COALESCE(base.vendor_name, '')) LIKE $${searchIndex}
        OR LOWER(COALESCE(base.computed_status, '')) LIKE $${searchIndex}
      )`);
    }

    if (Number.isFinite(branchId) && branchId > 0) {
      params.push(String(branchId));
      const branchIndex = params.length;
      // Include NULL branch_id (legacy records without branch assignment)
      whereParts.push(`(base.branch_id = $${branchIndex} OR base.branch_id IS NULL)`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const computedStatusExpression =
      mode === 'deliveries'
        ? `CASE
             WHEN COALESCE(sc.serial_count, 0) > 0 THEN 'in-progress'
             ELSE 'pending'
           END`
        : `COALESCE(po.status, 'pending')`;

    const baseCte = `
      WITH serial_counts AS (
        SELECT po_id, SUM(item_qty)::int AS serial_count
        FROM (
          SELECT 
            COALESCE(to_jsonb(tpi)->>'purchaseId', to_jsonb(tpi)->>'purchase_id', to_jsonb(tpi)->>'po_id') AS po_id,
            COALESCE(
              CASE 
                WHEN COALESCE(to_jsonb(tpi)->>'totalSetQty', to_jsonb(tpi)->>'total_set_qty', to_jsonb(tpi)->>'quantity', '') ~ '^-?\\d+$'
                THEN COALESCE(to_jsonb(tpi)->>'totalSetQty', to_jsonb(tpi)->>'total_set_qty', to_jsonb(tpi)->>'quantity', '0')::int
                ELSE 0
              END, 0
            ) as item_qty
          FROM tbltransaction_product_items tpi
          WHERE LOWER(COALESCE(to_jsonb(tpi)->>'transType', to_jsonb(tpi)->>'trans_type', 'purchase')) = 'purchase'
          UNION ALL
          SELECT 
            COALESCE(to_jsonb(tpi)->>'purchaseId', to_jsonb(tpi)->>'purchase_id', to_jsonb(tpi)->>'po_id') AS po_id,
            COALESCE(
              CASE 
                WHEN COALESCE(to_jsonb(tpi)->>'totalSetQty', to_jsonb(tpi)->>'total_set_qty', to_jsonb(tpi)->>'quantity', '') ~ '^-?\\d+$'
                THEN COALESCE(to_jsonb(tpi)->>'totalSetQty', to_jsonb(tpi)->>'total_set_qty', to_jsonb(tpi)->>'quantity', '0')::int
                ELSE 0
              END, 0
            ) as item_qty
          FROM tbltransaction_parts_items tpi
          WHERE LOWER(COALESCE(to_jsonb(tpi)->>'transType', to_jsonb(tpi)->>'trans_type', 'purchase')) = 'purchase'
          UNION ALL
          SELECT 
            COALESCE(to_jsonb(tpi)->>'purchaseId', to_jsonb(tpi)->>'purchase_id', to_jsonb(tpi)->>'po_id') AS po_id,
            COALESCE(
              CASE 
                WHEN COALESCE(to_jsonb(tpi)->>'totalSetQty', to_jsonb(tpi)->>'total_set_qty', to_jsonb(tpi)->>'quantity', '') ~ '^-?\\d+$'
                THEN COALESCE(to_jsonb(tpi)->>'totalSetQty', to_jsonb(tpi)->>'total_set_qty', to_jsonb(tpi)->>'quantity', '0')::int
                ELSE 0
              END, 0
            ) as item_qty
          FROM tbltransaction_material_items tpi
          WHERE LOWER(COALESCE(to_jsonb(tpi)->>'transType', to_jsonb(tpi)->>'trans_type', 'purchase')) = 'purchase'
        ) all_items
        GROUP BY po_id
      ),
      base AS (
        SELECT
          po.id,
          po.po_number,
          COALESCE(
            to_jsonb(po)->>'po_type',
            to_jsonb(po)->>'poType',
            'ACU'
          ) AS po_type,
          COALESCE(
            to_jsonb(po)->>'branchId',
            to_jsonb(po)->>'branch_id',
            ''
          ) AS branch_id,
          po.vendor_id::text AS vendor_id,
          v.name AS vendor_name,
          po.total_amount,
          COALESCE(po.status, 'pending') AS original_status,
          COALESCE(
            to_jsonb(po)->>'createdBy',
            to_jsonb(po)->>'created_by',
            ''
          ) AS created_by,
          po.created_at,
          COALESCE(sc.serial_count, 0)::int AS serial_count,
          ${computedStatusExpression} AS computed_status
        FROM tblpurchase_orders po
        LEFT JOIN tblvendors v
          ON v.id::text = po.vendor_id::text
        LEFT JOIN serial_counts sc
          ON sc.po_id = po.id::text
      )
    `;

    const countSql = `
      ${baseCte}
      SELECT COUNT(*)::text AS total
      FROM base
      ${whereSql}
    `;

    const countResult = await this.databaseService.query<PurchaseCountRow>(countSql, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    params.push(limit);
    params.push(offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;

    const listSql = `
      ${baseCte}
      SELECT
        base.id,
        base.po_number AS "poNumber",
        base.po_type AS "poType",
        base.vendor_id AS "vendorId",
        base.vendor_name AS "vendorName",
        COALESCE(to_jsonb(v)->>'address', '') AS "vendorAddress",
        COALESCE(
          to_jsonb(v)->>'contact_person',
          to_jsonb(v)->>'contactPerson',
          ''
        ) AS "vendorContactPerson",
        COALESCE(
          to_jsonb(v)->>'contact_number',
          to_jsonb(v)->>'contactNumber',
          ''
        ) AS "vendorContactNumber",
        base.total_amount::text AS "totalAmount",
        base.computed_status AS status,
        (
          SELECT json_build_object(
            'method', COALESCE(to_jsonb(pp)->>'method', null),
            'amount', COALESCE(NULLIF(to_jsonb(pp)->>'amount', '')::numeric, 0),
            'terms', COALESCE(to_jsonb(pp)->>'terms', null),
            'termsDueDate', COALESCE(
              to_jsonb(pp)->>'terms_due_date',
              to_jsonb(pp)->>'termsDueDate',
              null
            ),
            'status', COALESCE(to_jsonb(pp)->>'status', null),
            'paymentDate', COALESCE(
              to_jsonb(pp)->>'payment_date',
              to_jsonb(pp)->>'paymentDate',
              null
            ),
            'downPayment', COALESCE(
              NULLIF(
                COALESCE(
                  to_jsonb(pp)->>'down_payment',
                  to_jsonb(pp)->>'downPayment',
                  ''
                ),
                ''
              )::numeric,
              0
            )
          )
          FROM tblpo_payments pp
          WHERE COALESCE(
            to_jsonb(pp)->>'po_id',
            to_jsonb(pp)->>'poId'
          ) = base.id::text
          ORDER BY pp.id DESC
          LIMIT 1
        ) AS "paymentDetails",
        CASE
          WHEN UPPER(base.po_type) IN ('ACP', 'PO_TYPE_ACP') THEN (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', tpi.id,
                  'transType', COALESCE(
                    to_jsonb(tpi)->>'transType',
                    to_jsonb(tpi)->>'trans_type',
                    'purchase'
                  ),
                  'productId', COALESCE(
                    to_jsonb(tpi)->>'productId',
                    to_jsonb(tpi)->>'product_id',
                    to_jsonb(tpi)->>'part_id'
                  ),
                  'capacityId', NULL,
                  'unitPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'unitPrice', to_jsonb(tpi)->>'unit_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'sellPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'sellPrice', to_jsonb(tpi)->>'sell_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'discountPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'discountPrice', to_jsonb(tpi)->>'discount_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'unitTypesQty', COALESCE(
                    to_jsonb(tpi)->'unitTypesQty',
                    to_jsonb(tpi)->'unit_types_qty',
                    '[]'::jsonb
                  ),
                  'totalSetQty', COALESCE(
                    CASE
                      WHEN COALESCE(
                        to_jsonb(tpi)->>'totalSetQty',
                        to_jsonb(tpi)->>'total_set_qty',
                        to_jsonb(tpi)->>'quantity',
                        ''
                      ) ~ '^-?\\d+$'
                        AND ABS(COALESCE(
                          to_jsonb(tpi)->>'totalSetQty',
                          to_jsonb(tpi)->>'total_set_qty',
                          to_jsonb(tpi)->>'quantity',
                          '0'
                        )::numeric) <= 2147483647
                        THEN COALESCE(
                          to_jsonb(tpi)->>'totalSetQty',
                          to_jsonb(tpi)->>'total_set_qty',
                          to_jsonb(tpi)->>'quantity',
                          '0'
                        )::int
                      ELSE 0
                    END,
                    0
                  ),
                  'purchaseId', COALESCE(
                    to_jsonb(tpi)->>'purchaseId',
                    to_jsonb(tpi)->>'purchase_id',
                    to_jsonb(tpi)->>'po_id'
                  ),
                  'salesId', COALESCE(
                    to_jsonb(tpi)->>'salesId',
                    to_jsonb(tpi)->>'sales_id'
                  ),
                  'status', COALESCE(to_jsonb(tpi)->>'status', null),
                  'product', CASE
                    WHEN pt.id IS NULL THEN NULL
                    ELSE json_build_object(
                      'id', pt.id,
                      'productName', pt.parts_name,
                      'unit', NULL,
                      'productType', 'ACP'
                    )
                  END,
                  'capacity', NULL
                )
                ORDER BY tpi.id DESC
              ),
              '[]'::json
            )
            FROM tbltransaction_parts_items tpi
            LEFT JOIN tblparts pt
              ON pt.id::text = COALESCE(
                to_jsonb(tpi)->>'productId',
                to_jsonb(tpi)->>'product_id',
                to_jsonb(tpi)->>'part_id'
              )
            WHERE COALESCE(
              to_jsonb(tpi)->>'purchaseId',
              to_jsonb(tpi)->>'purchase_id',
              to_jsonb(tpi)->>'po_id'
            ) = base.id::text
            AND LOWER(COALESCE(
              to_jsonb(tpi)->>'transType',
              to_jsonb(tpi)->>'trans_type',
              'purchase'
            )) = 'purchase'
          )
          WHEN UPPER(base.po_type) IN ('ACM', 'PO_TYPE_ACM', 'MATERIAL') THEN (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', tpi.id,
                  'transType', COALESCE(
                    to_jsonb(tpi)->>'transType',
                    to_jsonb(tpi)->>'trans_type',
                    'purchase'
                  ),
                  'productId', COALESCE(
                    to_jsonb(tpi)->>'productId',
                    to_jsonb(tpi)->>'product_id',
                    to_jsonb(tpi)->>'material_id'
                  ),
                  'capacityId', NULL,
                  'unitPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'unitPrice', to_jsonb(tpi)->>'unit_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'sellPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'sellPrice', to_jsonb(tpi)->>'sell_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'discountPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'discountPrice', to_jsonb(tpi)->>'discount_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'unitTypesQty', COALESCE(
                    to_jsonb(tpi)->'unitTypesQty',
                    to_jsonb(tpi)->'unit_types_qty',
                    '[]'::jsonb
                  ),
                  'totalSetQty', COALESCE(
                    CASE
                      WHEN COALESCE(
                        to_jsonb(tpi)->>'totalSetQty',
                        to_jsonb(tpi)->>'total_set_qty',
                        to_jsonb(tpi)->>'quantity',
                        ''
                      ) ~ '^-?\\d+$'
                        AND ABS(COALESCE(
                          to_jsonb(tpi)->>'totalSetQty',
                          to_jsonb(tpi)->>'total_set_qty',
                          to_jsonb(tpi)->>'quantity',
                          '0'
                        )::numeric) <= 2147483647
                        THEN COALESCE(
                          to_jsonb(tpi)->>'totalSetQty',
                          to_jsonb(tpi)->>'total_set_qty',
                          to_jsonb(tpi)->>'quantity',
                          '0'
                        )::int
                      ELSE 0
                    END,
                    0
                  ),
                  'purchaseId', COALESCE(
                    to_jsonb(tpi)->>'purchaseId',
                    to_jsonb(tpi)->>'purchase_id',
                    to_jsonb(tpi)->>'po_id'
                  ),
                  'salesId', COALESCE(
                    to_jsonb(tpi)->>'salesId',
                    to_jsonb(tpi)->>'sales_id'
                  ),
                  'status', COALESCE(to_jsonb(tpi)->>'status', null),
                  'product', CASE
                    WHEN mt.id IS NULL THEN NULL
                    ELSE json_build_object(
                      'id', mt.id,
                      'productName', mt.material_name,
                      'unit', mt.unit,
                      'productType', 'ACM'
                    )
                  END,
                  'capacity', NULL
                )
                ORDER BY tpi.id DESC
              ),
              '[]'::json
            )
            FROM tbltransaction_material_items tpi
            LEFT JOIN tblmaterials mt
              ON mt.id::text = COALESCE(
                to_jsonb(tpi)->>'productId',
                to_jsonb(tpi)->>'product_id',
                to_jsonb(tpi)->>'material_id'
              )
            WHERE COALESCE(
              to_jsonb(tpi)->>'purchaseId',
              to_jsonb(tpi)->>'purchase_id',
              to_jsonb(tpi)->>'po_id'
            ) = base.id::text
            AND LOWER(COALESCE(
              to_jsonb(tpi)->>'transType',
              to_jsonb(tpi)->>'trans_type',
              'purchase'
            )) = 'purchase'
          )
          ELSE (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', tpi.id,
                  'transType', COALESCE(
                    to_jsonb(tpi)->>'transType',
                    to_jsonb(tpi)->>'trans_type',
                    'purchase'
                  ),
                  'productId', COALESCE(
                    to_jsonb(tpi)->>'productId',
                    to_jsonb(tpi)->>'product_id'
                  ),
                  'capacityId', COALESCE(
                    to_jsonb(tpi)->>'capacityId',
                    to_jsonb(tpi)->>'capacity_id'
                  ),
                  'unitPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'unitPrice', to_jsonb(tpi)->>'unit_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'sellPrice', COALESCE(
                    NULLIF(
                      COALESCE(to_jsonb(tpi)->>'sellPrice', to_jsonb(tpi)->>'sell_price', ''),
                      ''
                    )::numeric,
                    0
                  ),
                  'discountPrice', COALESCE(
                    NULLIF(
                      COALESCE(
                        to_jsonb(tpi)->>'discountPrice',
                        to_jsonb(tpi)->>'discount_price',
                        ''
                      ),
                      ''
                    )::numeric,
                    0
                  ),
                  'unitTypesQty', COALESCE(
                    to_jsonb(tpi)->'unitTypesQty',
                    to_jsonb(tpi)->'unit_types_qty',
                    '[]'::jsonb
                  ),
                  'totalSetQty', COALESCE(
                    CASE
                      WHEN COALESCE(
                        to_jsonb(tpi)->>'totalSetQty',
                        to_jsonb(tpi)->>'total_set_qty',
                        ''
                      ) ~ '^-?\\d+$'
                        AND ABS(
                          COALESCE(
                            to_jsonb(tpi)->>'totalSetQty',
                            to_jsonb(tpi)->>'total_set_qty',
                            '0'
                          )::numeric
                        ) <= 2147483647
                        THEN COALESCE(
                          to_jsonb(tpi)->>'totalSetQty',
                          to_jsonb(tpi)->>'total_set_qty',
                          '0'
                        )::int
                      ELSE 0
                    END,
                    0
                  ),
                  'purchaseId', COALESCE(
                    to_jsonb(tpi)->>'purchaseId',
                    to_jsonb(tpi)->>'purchase_id',
                    to_jsonb(tpi)->>'po_id'
                  ),
                  'salesId', COALESCE(
                    to_jsonb(tpi)->>'salesId',
                    to_jsonb(tpi)->>'sales_id'
                  ),
                  'status', COALESCE(to_jsonb(tpi)->>'status', null),
                  'product', CASE
                    WHEN p.id IS NULL THEN NULL
                    ELSE json_build_object(
                      'id', p.id,
                      'productName', COALESCE(
                        to_jsonb(p)->>'productName',
                        to_jsonb(p)->>'product_name',
                        to_jsonb(p)->>'productname'
                      ),
                      'unit', COALESCE(to_jsonb(p)->>'unit', null),
                      'productType', COALESCE(
                        to_jsonb(p)->>'productType',
                        to_jsonb(p)->>'product_type',
                        to_jsonb(p)->>'producttype'
                      )
                    )
                  END,
                  'capacity', CASE
                    WHEN c.id IS NULL THEN NULL
                    ELSE json_build_object(
                      'id', c.id,
                      'capacity', COALESCE(to_jsonb(c)->>'capacity', null),
                      'indoorModel', COALESCE(
                        to_jsonb(c)->>'indoorModel',
                        to_jsonb(c)->>'indoor_model'
                      ),
                      'outdoorModel', COALESCE(
                        to_jsonb(c)->>'outdoorModel',
                        to_jsonb(c)->>'outdoor_model'
                      ),
                      'srp', COALESCE(NULLIF(to_jsonb(c)->>'srp', '')::numeric, 0),
                      'netPrice', COALESCE(
                        NULLIF(
                          COALESCE(to_jsonb(c)->>'netPrice', to_jsonb(c)->>'net_price', ''),
                          ''
                        )::numeric,
                        0
                      )
                    )
                  END
                )
                ORDER BY tpi.id DESC
              ),
              '[]'::json
            )
            FROM tbltransaction_product_items tpi
            LEFT JOIN tblproducts p
              ON p.id::text = COALESCE(
                to_jsonb(tpi)->>'productId',
                to_jsonb(tpi)->>'product_id'
              )
            LEFT JOIN tblcapacity c
              ON c.id::text = COALESCE(
                to_jsonb(tpi)->>'capacityId',
                to_jsonb(tpi)->>'capacity_id'
              )
            WHERE COALESCE(
              to_jsonb(tpi)->>'purchaseId',
              to_jsonb(tpi)->>'purchase_id',
              to_jsonb(tpi)->>'po_id'
            ) = base.id::text
          )
        END AS "productItems",
        base.created_at::text AS "createdAt",
        base.serial_count::int AS "serialCount"
      FROM base
      LEFT JOIN tblvendors v
        ON v.id::text = base.vendor_id::text
      ${whereSql}
      ORDER BY base.created_at DESC, base.id DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const listResult = await this.databaseService.query<PurchaseRow>(listSql, params);

    return {
      success: true,
      items: listResult.rows.map((row) => this.toPurchaseTabItem(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private normalizePage(value: number | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  }

  private normalizeLimit(value: number | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 10;
    }

    return Math.min(Math.floor(parsed), 100);
  }

  private toPurchaseTabItem(row: PurchaseRow): PurchaseTabItemDto {
    const totalAmount = Number(row.totalAmount ?? 0);
    const productItems = (row.productItems as any[]) ?? [];
    // Transfer PO logic: if any productItem has a salesId, treat as transfer PO
    const transferProduct = productItems.find((item) => !!item.salesId);
    let isTransferPO = false;
    let originatingSalesOrder: null | { id: number } = null;
    if (transferProduct && transferProduct.salesId) {
      isTransferPO = true;
      originatingSalesOrder = { id: transferProduct.salesId };
    }
    return {
      id: row.id,
      poNumber: row.poNumber ?? '-',
      vendorId: row.vendorId,
      vendorName: row.vendorName ?? 'Unknown Vendor',
      vendor: {
        id: row.vendorId,
        name: row.vendorName ?? 'Unknown Vendor',
        address: row.vendorAddress,
        contactPerson: row.vendorContactPerson,
        contactNumber: row.vendorContactNumber,
      },
      totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
      status: row.status ?? 'pending',
      paymentDetails:
        (row.paymentDetails as PurchaseTabItemDto['paymentDetails']) ?? null,
      productItems,
      createdAt: row.createdAt,
      serialCount: row.serialCount ?? 0,
      isTransferPO,
      originatingSalesOrder,
    };
  }

  private normalizeUnitTypesQty(
    value: unknown,
  ): Array<{ label: string; value: number }> {
    let parsedValue: unknown = value;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return [];
      }

      try {
        parsedValue = JSON.parse(trimmed);
      } catch {
        parsedValue = trimmed;
      }
    }

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const normalized = parsedValue
      .map((entry) => {
        if (typeof entry === 'string') {
          const [labelRaw, qtyRaw] = entry.split(':');
          const label = String(labelRaw ?? '').trim();
          const qty = this.toOptionalNumber(String(qtyRaw ?? '').trim()) ?? 0;

          return {
            label: label || 'set',
            value: qty,
          };
        }

        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const asRecord = entry as Record<string, unknown>;
        const label = String(
          asRecord.label ?? asRecord.unitType ?? asRecord.unit_type ?? 'set',
        )
          .trim()
          .toLowerCase();
        const qty = this.toOptionalNumber(asRecord.value ?? asRecord.qty) ?? 0;

        return {
          label: label || 'set',
          value: qty,
        };
      })
      .filter((entry): entry is { label: string; value: number } => entry !== null);

    return normalized;
  }
}
