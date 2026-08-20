import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PoolClient } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { ListQuotationQueryDto } from './dto/list-quotation-query.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { AuditActorContext, AuditLogService } from 'src/audit-log/audit-log.service';

type TableQueryExecutor = { query: PoolClient['query'] };

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async getQuotationAuditSnapshot(id: number): Promise<Record<string, unknown> | null> {
    const result = await this.findOne(id);
    if (!result.success || !result.item || typeof result.item !== 'object') {
      return null;
    }

    return result.item as Record<string, unknown>;
  }

  private async getTableColumns(
    executor: TableQueryExecutor,
    tableName: string,
  ): Promise<string[]> {
    const result = await executor.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );

    return result.rows.map((row) => row.column_name);
  }

  private pickColumn(availableColumns: string[], candidates: string[]): string | undefined {
    const lowered = new Set(availableColumns.map((column) => column.toLowerCase()));
    return candidates.find((candidate) => lowered.has(candidate.toLowerCase()));
  }

  private async runInsert(
    executor: TableQueryExecutor,
    tableName: string,
    record: Record<string, unknown>,
  ) {
    const columns = Object.keys(record);
    const values = Object.values(record);
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

    try {
      return await executor.query<{ id: number }>(
        `INSERT INTO ${tableName} (${quotedColumns}) VALUES (${placeholders}) RETURNING id`,
        values,
      );
    } catch (err: any) {
      // If id auto-generation fails, insert with explicit next id
      if (err?.message?.includes('null value in column "id"') || err?.message?.includes('violates not-null constraint')) {
        const maxResult = await executor.query<{ max_id: string }>(
          `SELECT COALESCE(MAX(id), 0)::text AS max_id FROM ${tableName}`
        );
        const nextVal = Number(maxResult.rows[0]?.max_id ?? 0) + 1;

        const explicitColumns = ['"id"', ...columns.map(c => `"${c}"`)].join(', ');
        const explicitValues = [nextVal, ...values];
        const explicitPlaceholders = explicitValues.map((_, i) => `$${i + 1}`).join(', ');
        return executor.query<{ id: number }>(
          `INSERT INTO ${tableName} (${explicitColumns}) VALUES (${explicitPlaceholders}) RETURNING id`,
          explicitValues,
        );
      }
      throw err;
    }
  }

  private normalizePage(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }

    return Math.floor(parsed);
  }

  private normalizeLimit(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 10;
    }

    return Math.min(100, Math.floor(parsed));
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

    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  private normalizeStatus(status: unknown): 'draft' | 'finalized' | 'converted' | 'cancelled' | 'expired' {
    const normalized = String(status ?? 'draft')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');

    if (['finalized', 'converted', 'cancelled', 'expired'].includes(normalized)) {
      return normalized as 'finalized' | 'converted' | 'cancelled' | 'expired';
    }

    return 'draft';
  }

  private getDatabaseExecutor(): TableQueryExecutor {
    return {
      query: this.databaseService.query.bind(this.databaseService) as PoolClient['query'],
    };
  }

  private normalizeValidityDays(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 14;
    }

    return Math.min(3650, Math.max(1, Math.floor(parsed)));
  }

  private computeExpiresAt(quoteDate: string, validityDays: number): string {
    const parsed = new Date(String(quoteDate));
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    parsed.setUTCDate(parsed.getUTCDate() + this.normalizeValidityDays(validityDays));
    return parsed.toISOString();
  }

  private async softDeleteExpiredDraftQuotations(executor: TableQueryExecutor): Promise<void> {
    await executor.query(
      `UPDATE tblquotation
       SET status = 'expired',
           is_deleted = true,
           expired_at = COALESCE(expired_at, NOW()),
           deleted_at = COALESCE(deleted_at, NOW()),
           updated_at = NOW()
       WHERE COALESCE(is_deleted, false) = false
         AND LOWER(COALESCE(status, 'draft')) = 'draft'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()`
    );
  }

  private calculateItemLineTotal(item: {
    unitPrice?: unknown;
    sellPrice?: unknown;
    discountPrice?: unknown;
    totalSetQty?: unknown;
    remarks?: unknown;
  }): number {
    const unitPrice = this.toOptionalNumber(item.unitPrice) ?? 0;
    const sellPrice = this.toOptionalNumber(item.sellPrice) ?? 0;
    const discountPrice = this.toOptionalNumber(item.discountPrice) ?? 0;
    const totalSetQty = this.toOptionalNumber(item.totalSetQty) ?? 0;
    const priceToUse = discountPrice > 0 ? discountPrice : sellPrice > 0 ? sellPrice : unitPrice;
    
    return priceToUse * totalSetQty + this.extractMiscTotalFromRemarks(item.remarks);
  }

  private extractMiscTotalFromRemarks(remarks: unknown): number {
    const raw = String(remarks ?? '').trim();
    if (!raw.startsWith('__QMETA__')) {
      return 0;
    }

    try {
      const parsed = JSON.parse(raw.replace('__QMETA__', '').trim()) as {
        installationDetails?: Array<{
          unitPrice?: unknown;
          excessQty?: unknown;
        }>;
      };

      if (!Array.isArray(parsed.installationDetails)) {
        return 0;
      }

      return parsed.installationDetails.reduce((sum, detail) => {
        const detailUnitPrice = this.toOptionalNumber(detail?.unitPrice) ?? 0;
        const detailExcessQty = this.toOptionalNumber(detail?.excessQty) ?? 0;
        return sum + detailUnitPrice * Math.max(0, detailExcessQty);
      }, 0);
    } catch {
      return 0;
    }
  }

  private parseMaterialMetadataFromRemarks(remarks: unknown): {
    isMaterial: boolean;
    materialId: number | null;
    description: string;
    itemCode: string | null;
    brand: string | null;
    isNonInventory: boolean;
  } {
    const fallback = {
      isMaterial: false,
      materialId: null,
      description: '',
      itemCode: null,
      brand: null,
      isNonInventory: false,
    };

    const raw = String(remarks ?? '').trim();
    if (!raw || !raw.startsWith('{')) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const type = String(parsed.type ?? '').trim().toLowerCase();
      if (type !== 'material') {
        return fallback;
      }

      return {
        isMaterial: true,
        materialId: this.toOptionalNumber(parsed.materialId),
        description: String(parsed.description ?? '').trim(),
        itemCode: String(parsed.itemCode ?? '').trim() || null,
        brand: String(parsed.brand ?? '').trim() || null,
        isNonInventory: Boolean(parsed.isNonInventory),
      };
    } catch {
      return fallback;
    }
  }

  private resolveQuotationItemMaterialId(item: { materialId?: unknown; remarks?: unknown }): number | null {
    const directMaterialId = this.toOptionalNumber(item.materialId);
    if (directMaterialId !== null) {
      return directMaterialId;
    }

    return this.parseMaterialMetadataFromRemarks(item.remarks).materialId;
  }

  private async upsertCustomerFromPayload(
    executor: TableQueryExecutor,
    payload: CreateQuotationDto,
  ): Promise<string> {
    let customerId = String(payload.customer_id ?? '').trim();
    if (customerId) {
      const existingCustomer = await executor.query<{ id: string }>(
        `SELECT id FROM tblcustomer WHERE id::text = $1 LIMIT 1`,
        [customerId],
      );
      if (existingCustomer.rowCount > 0) {
        return customerId;
      }
    }

    const customerName = String(payload.customer?.name ?? '').trim();
    if (!customerName) {
      throw new Error('customer_id or customer.name is required');
    }

    const customerColumns = await this.getTableColumns(executor, 'tblcustomer');
    const customerIdColumn = this.pickColumn(customerColumns, ['id']);
  const customerNameColumn = this.pickColumn(customerColumns, ['name', 'customer_name']);
    const customerAddressColumn = this.pickColumn(customerColumns, ['address']);
    const customerContactPersonColumn = this.pickColumn(customerColumns, ['contact_person', 'contactPerson']);
    const customerContactNumberColumn = this.pickColumn(customerColumns, ['contact_number', 'contactNumber']);
    const customerEmailColumn = this.pickColumn(customerColumns, ['email']);
    const customerTinColumn = this.pickColumn(customerColumns, ['tin_number', 'tinNumber']);

    if (!customerNameColumn) {
      throw new Error('tblcustomer name column is missing');
    }

    const address = String(payload.customer?.address ?? '').trim();
    const contactPerson = String(payload.customer?.contact_person ?? '').trim();
    const contactNumber = String(payload.customer?.contact_number ?? '').trim();
    const email = String(payload.customer?.email ?? '').trim();
    const tinNumber = String(payload.customer?.tin_number ?? '').trim();

    const duplicateParams: string[] = [customerName];
    const duplicateWhere = [
      `LOWER(TRIM(COALESCE("${customerNameColumn}"::text, ''))) = LOWER(TRIM($1))`,
    ];

    if (customerAddressColumn && address) {
      duplicateParams.push(address);
      duplicateWhere.push(
        `LOWER(TRIM(COALESCE("${customerAddressColumn}"::text, ''))) = LOWER(TRIM($${duplicateParams.length}))`,
      );
    }
    if (customerContactPersonColumn && contactPerson) {
      duplicateParams.push(contactPerson);
      duplicateWhere.push(
        `LOWER(TRIM(COALESCE("${customerContactPersonColumn}"::text, ''))) = LOWER(TRIM($${duplicateParams.length}))`,
      );
    }
    if (customerContactNumberColumn && contactNumber) {
      duplicateParams.push(contactNumber);
      duplicateWhere.push(
        `LOWER(TRIM(COALESCE("${customerContactNumberColumn}"::text, ''))) = LOWER(TRIM($${duplicateParams.length}))`,
      );
    }
    if (customerEmailColumn && email) {
      duplicateParams.push(email);
      duplicateWhere.push(
        `LOWER(TRIM(COALESCE("${customerEmailColumn}"::text, ''))) = LOWER(TRIM($${duplicateParams.length}))`,
      );
    }
    if (customerTinColumn && tinNumber) {
      duplicateParams.push(tinNumber);
      duplicateWhere.push(
        `LOWER(TRIM(COALESCE("${customerTinColumn}"::text, ''))) = LOWER(TRIM($${duplicateParams.length}))`,
      );
    }

    const duplicateCustomer = await executor.query<{ id: string }>(
      `SELECT id::text AS id
       FROM tblcustomer
       WHERE ${duplicateWhere.join(' AND ')}
       ORDER BY id ASC
       LIMIT 1`,
      duplicateParams,
    );

    if (duplicateCustomer.rowCount > 0) {
      return String(duplicateCustomer.rows[0].id);
    }

    const customerRecord: Record<string, unknown> = {
      [customerNameColumn]: customerName,
    };

    if (customerIdColumn) {
      customerRecord[customerIdColumn] = randomUUID();
    }

    if (customerAddressColumn && address) customerRecord[customerAddressColumn] = address;
    if (customerContactPersonColumn && contactPerson) customerRecord[customerContactPersonColumn] = contactPerson;
    if (customerContactNumberColumn && contactNumber) customerRecord[customerContactNumberColumn] = contactNumber;
    if (customerEmailColumn && email) customerRecord[customerEmailColumn] = email;
    if (customerTinColumn && tinNumber) customerRecord[customerTinColumn] = tinNumber;

    const insertedCustomer = await this.runInsert(executor, 'tblcustomer', customerRecord);
    if (insertedCustomer.rowCount === 0) {
      throw new Error('Failed to create customer');
    }

    customerId = String(insertedCustomer.rows[0].id);
    return customerId;
  }

  private async getCustomerSnapshotById(
    executor: TableQueryExecutor,
    customerId: string,
  ): Promise<{
    name: string;
    address: string;
    contactPerson: string;
    contactNumber: string;
    email: string;
    tinNumber: string;
  } | null> {
    const normalizedId = String(customerId ?? '').trim();
    if (!normalizedId) {
      return null;
    }

    const result = await executor.query<{
      name: string | null;
      address: string | null;
      contactPerson: string | null;
      contactNumber: string | null;
      email: string | null;
      tinNumber: string | null;
    }>(
      `SELECT
         COALESCE(to_jsonb(c)->>'name', to_jsonb(c)->>'customer_name', '') AS name,
         COALESCE(to_jsonb(c)->>'address', '') AS address,
         COALESCE(to_jsonb(c)->>'contact_person', to_jsonb(c)->>'contactPerson', '') AS "contactPerson",
         COALESCE(to_jsonb(c)->>'contact_number', to_jsonb(c)->>'contactNumber', '') AS "contactNumber",
         COALESCE(to_jsonb(c)->>'email', '') AS email,
         COALESCE(to_jsonb(c)->>'tin_number', to_jsonb(c)->>'tinNumber', '') AS "tinNumber"
       FROM tblcustomer c
       WHERE c.id::text = $1
       LIMIT 1`,
      [normalizedId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      name: String(row.name ?? '').trim(),
      address: String(row.address ?? '').trim(),
      contactPerson: String(row.contactPerson ?? '').trim(),
      contactNumber: String(row.contactNumber ?? '').trim(),
      email: String(row.email ?? '').trim(),
      tinNumber: String(row.tinNumber ?? '').trim(),
    };
  }

  async create(
    createQuotationDto: CreateQuotationDto,
    userId?: number,
    branchId?: number,
    auditActor?: AuditActorContext,
  ) {
    const productItems = Array.isArray(createQuotationDto.productItems)
      ? createQuotationDto.productItems
      : [];

    if (productItems.length === 0) {
      return { success: false, message: 'At least one quotation product item is required' };
    }

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const quotationColumns = await this.getTableColumns(client, 'tblquotation');
        if (quotationColumns.length === 0) {
          throw new Error('tblquotation table does not exist. Run quotation SQL migration first.');
        }

        const quotationItemsColumns = await this.getTableColumns(client, 'tblquotation_items');
        if (quotationItemsColumns.length === 0) {
          throw new Error('tblquotation_items table does not exist. Run quotation SQL migration first.');
        }

        const customerId = await this.upsertCustomerFromPayload(client, createQuotationDto);
        const customerSnapshot = await this.getCustomerSnapshotById(client, customerId);

        const payloadCustomerName = String(createQuotationDto.customer?.name ?? '').trim();
        const payloadCustomerAddress = String(createQuotationDto.customer?.address ?? '').trim();
        const payloadCustomerContactPerson = String(createQuotationDto.customer?.contact_person ?? '').trim();
        const payloadCustomerContactNumber = String(createQuotationDto.customer?.contact_number ?? '').trim();
        const payloadCustomerEmail = String(createQuotationDto.customer?.email ?? '').trim();
        const payloadCustomerTinNumber = String(createQuotationDto.customer?.tin_number ?? '').trim();

        const computedTotal = productItems.reduce(
          (sum, item) => sum + this.calculateItemLineTotal(item),
          0,
        );
        const totalAmount =
          computedTotal > 0 ? computedTotal : this.toOptionalNumber(createQuotationDto.totalAmount) ?? 0;

        const quoteDate = this.toIsoDateOrNull(createQuotationDto.quoteDate) ?? new Date().toISOString();
        const validityDays = this.normalizeValidityDays(createQuotationDto.validityDays);
        const expiresAt = this.computeExpiresAt(quoteDate, validityDays);
        const status = this.normalizeStatus(createQuotationDto.status);

        const quotationRecord: Record<string, unknown> = {
          quote_date: quoteDate,
          customer_id: customerId,
          customer_name: payloadCustomerName || customerSnapshot?.name || '',
          customer_address: payloadCustomerAddress || customerSnapshot?.address || '',
          customer_contact_person: payloadCustomerContactPerson || customerSnapshot?.contactPerson || '',
          customer_contact_number: payloadCustomerContactNumber || customerSnapshot?.contactNumber || '',
          customer_email: payloadCustomerEmail || customerSnapshot?.email || '',
          customer_tin_number: payloadCustomerTinNumber || customerSnapshot?.tinNumber || '',
          total_amount: totalAmount,
          validity_days: validityDays,
          expires_at: expiresAt,
          status,
          remarks: String(createQuotationDto.remarks ?? '').trim(),
          terms_conditions: JSON.stringify({
            warrantyException: String(createQuotationDto.termsConditions?.warrantyException ?? '').trim(),
            validity: String(createQuotationDto.termsConditions?.validity ?? '').trim(),
            note: String(createQuotationDto.termsConditions?.note ?? '').trim(),
            penaltyFee: String(createQuotationDto.termsConditions?.penaltyFee ?? '').trim(),
            warranty: String(createQuotationDto.termsConditions?.warranty ?? '').trim(),
          }),
        };

        if (Number.isFinite(userId)) {
          quotationRecord.created_by = userId;
        }
        if (Number.isFinite(branchId)) {
          quotationRecord.branch_id = branchId;
        }

        const insertedQuotation = await this.runInsert(client, 'tblquotation', quotationRecord);
        if (insertedQuotation.rowCount === 0) {
          throw new Error('Failed to create quotation');
        }

        const quotationId = Number(insertedQuotation.rows[0].id);

        for (const item of productItems) {
          // Determine if this is a material-style item or AC unit item
          const isMaterialItem = item.description || item.materialId != null || item.rate != null;

          let unitPrice: number;
          let sellPrice: number;
          let discountPrice: number;
          let totalSetQty: number;
          let lineTotal: number;
          let itemRemarks: string;
          let productId: number | null;
          let capacityId: number | null;

          if (isMaterialItem) {
            // Material quotation item
            unitPrice = Number(item.cost ?? item.unitPrice ?? 0);
            sellPrice = Number(item.rate ?? item.sellPrice ?? 0);
            discountPrice = Number(item.discount ?? item.discountPrice ?? 0);
            totalSetQty = Number(item.qty ?? item.totalSetQty ?? 0);
            lineTotal = Math.max(0, sellPrice - discountPrice) * totalSetQty;
            productId = null; // Don't use product_id FK — materialId goes in metadata
            capacityId = null;

            // Store material metadata in remarks as JSON
            const metadata: Record<string, unknown> = {
              type: 'material',
              materialId: this.resolveQuotationItemMaterialId(item),
              description: item.description ?? '',
              itemCode: item.itemCode ?? null,
              brand: item.brand ?? null,
              isNonInventory: item.isNonInventory ?? false,
            };
            itemRemarks = JSON.stringify(metadata);
          } else {
            // AC unit quotation item (original format)
            unitPrice = this.toOptionalNumber(item.unitPrice) ?? 0;
            sellPrice = this.toOptionalNumber(item.sellPrice) ?? 0;
            discountPrice = this.toOptionalNumber(item.discountPrice) ?? 0;
            totalSetQty = this.toOptionalNumber(item.totalSetQty) ?? 0;
            lineTotal = this.calculateItemLineTotal(item);
            productId = this.toOptionalNumber(item.productId);
            capacityId = this.toOptionalNumber(item.capacityId);
            itemRemarks = String(item.remarks ?? '').trim();
          }

          const itemRecord: Record<string, unknown> = {
            quotation_id: quotationId,
            material_id: this.resolveQuotationItemMaterialId(item),
            product_id: productId,
            capacity_id: capacityId,
            unit_price: unitPrice,
            sell_price: sellPrice,
            discount_price: discountPrice,
            unit_types_qty: JSON.stringify(item.unitTypesQty ?? []),
            total_set_qty: totalSetQty,
            line_total: lineTotal,
            remarks: itemRemarks,
          };

          await this.runInsert(client, 'tblquotation_items', itemRecord);
        }

        const quoteNoResult = await client.query<{ quote_no: string | null }>(
          `SELECT quote_no
           FROM tblquotation
           WHERE id = $1
           LIMIT 1`,
          [quotationId],
        );

        return {
          quotationId,
          quoteNo: String(quoteNoResult.rows[0]?.quote_no ?? '').trim(),
          totalAmount,
          status,
        };
      });

      const afterSnapshot = await this.getQuotationAuditSnapshot(result.quotationId);
      await this.auditLogService.logMutation({
        action: 'QUOTATION_CREATE',
        entityType: 'quotation',
        entityId: result.quotationId,
        actor: auditActor ?? { userId, branchId },
        description: `Created quotation ${result.quoteNo || `#${result.quotationId}`}`,
        requestBody: createQuotationDto as unknown as Record<string, unknown>,
        after: afterSnapshot,
        metadata: {
          quoteNo: result.quoteNo,
          status: result.status,
          totalAmount: result.totalAmount,
        },
      });

      return {
        success: true,
        message: 'Quotation created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create quotation',
      };
    }
  }

  async findAll(query: ListQuotationQueryDto) {
    await this.softDeleteExpiredDraftQuotations(this.getDatabaseExecutor());

    const page = this.normalizePage(query.page);
    const limit = this.normalizeLimit(query.limit);
    const offset = (page - 1) * limit;
    const search = String(query.search ?? '').trim().toLowerCase();
    const status = String(query.status ?? '').trim().toLowerCase();
    const branchId = Number(query.branchId);

    const params: unknown[] = [];
    const whereParts: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      whereParts.push(`(
        LOWER(COALESCE(q.quote_no, '')) LIKE $${idx}
        OR LOWER(COALESCE(q.customer_name, '')) LIKE $${idx}
        OR LOWER(COALESCE(q.status, '')) LIKE $${idx}
      )`);
    }

    if (status && status !== 'all') {
      if (status === 'expired') {
        whereParts.push(`(COALESCE(q.is_deleted, false) = true OR LOWER(COALESCE(q.status, '')) = 'expired')`);
      } else {
        params.push(status);
        const idx = params.length;
        whereParts.push(`LOWER(COALESCE(q.status, '')) = $${idx}`);
        whereParts.push(`COALESCE(q.is_deleted, false) = false`);
      }
    } else {
      whereParts.push(`COALESCE(q.is_deleted, false) = false`);
    }

    if (Number.isFinite(branchId) && branchId > 0) {
      params.push(String(branchId));
      const idx = params.length;
      whereParts.push(
        `COALESCE(to_jsonb(q)->>'branchId', to_jsonb(q)->>'branch_id', '') = $${idx}`,
      );
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const countResult = await this.databaseService.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM tblquotation q
       ${whereSql}`,
      params,
    );

    const total = Number(countResult.rows[0]?.total ?? 0);

    params.push(limit);
    params.push(offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;

    const listResult = await this.databaseService.query<{
      id: number;
      quoteNo: string | null;
      quoteDate: string | null;
      customerId: string | null;
      customerName: string | null;
      totalAmount: string | null;
      validityDays: string | null;
      status: string | null;
      remarks: string | null;
      convertedSalesId: string | null;
      expiresAt: string | null;
      expiredAt: string | null;
      isDeleted: boolean | null;
      deletedAt: string | null;
      createdAt: string | null;
    }>(
      `SELECT
         q.id,
         q.quote_no AS "quoteNo",
         q.quote_date::text AS "quoteDate",
         q.customer_id::text AS "customerId",
         q.customer_name AS "customerName",
         q.total_amount::text AS "totalAmount",
         q.validity_days::text AS "validityDays",
         q.status,
         q.remarks,
         q.converted_sales_id::text AS "convertedSalesId",
         q.expires_at::text AS "expiresAt",
         q.expired_at::text AS "expiredAt",
         q.is_deleted AS "isDeleted",
         q.deleted_at::text AS "deletedAt",
         q.created_at::text AS "createdAt"
       FROM tblquotation q
       ${whereSql}
       ORDER BY q.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      params,
    );

    return {
      success: true,
      items: listResult.rows.map((row) => ({
        id: row.id,
        quoteNo: String(row.quoteNo ?? '').trim(),
        quoteDate: row.quoteDate,
        customerId: row.customerId,
        customerName: String(row.customerName ?? '').trim(),
        totalAmount: Number(row.totalAmount ?? 0),
        validityDays: this.normalizeValidityDays(row.validityDays),
        status: String(row.status ?? 'draft').trim() || 'draft',
        remarks: String(row.remarks ?? '').trim(),
        convertedSalesId: this.toOptionalNumber(row.convertedSalesId),
        expiresAt: row.expiresAt,
        expiredAt: row.expiredAt,
        isDeleted: Boolean(row.isDeleted),
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid quotation id' };
    }

    await this.softDeleteExpiredDraftQuotations(this.getDatabaseExecutor());

    const quotationResult = await this.databaseService.query<{
      id: number;
      quoteNo: string | null;
      quoteDate: string | null;
      customerId: string | null;
      customerName: string | null;
      customerAddress: string | null;
      customerContactPerson: string | null;
      customerContactNumber: string | null;
      customerEmail: string | null;
      customerTinNumber: string | null;
      totalAmount: string | null;
      validityDays: string | null;
      status: string | null;
      remarks: string | null;
      termsConditions: unknown;
      convertedSalesId: string | null;
      expiresAt: string | null;
      expiredAt: string | null;
      isDeleted: boolean | null;
      deletedAt: string | null;
      createdAt: string | null;
      createdBy: string | null;
    }>(
      `SELECT
         q.id,
         q.created_by::text AS "createdBy",
         COALESCE(
           to_jsonb(u)->>'fullname',
           to_jsonb(u)->>'fullName',
           to_jsonb(u)->>'full_name',
           ''
         ) AS "createdByName",
         q.quote_no AS "quoteNo",
         q.quote_date::text AS "quoteDate",
         q.customer_id::text AS "customerId",
         q.customer_name AS "customerName",
         q.customer_address AS "customerAddress",
         q.customer_contact_person AS "customerContactPerson",
         q.customer_contact_number AS "customerContactNumber",
         q.customer_email AS "customerEmail",
         q.customer_tin_number AS "customerTinNumber",
         q.total_amount::text AS "totalAmount",
         q.validity_days::text AS "validityDays",
         q.status,
         q.remarks,
         q.terms_conditions AS "termsConditions",
         q.converted_sales_id::text AS "convertedSalesId",
         q.expires_at::text AS "expiresAt",
         q.expired_at::text AS "expiredAt",
         q.is_deleted AS "isDeleted",
         q.deleted_at::text AS "deletedAt",
         q.created_at::text AS "createdAt"
      FROM tblquotation q
      LEFT JOIN tblusers u ON u.id::text = q.created_by::text
      WHERE q.id = $1
       LIMIT 1`,
      [id],
    );

    if (quotationResult.rowCount === 0) {
      return { success: false, message: 'Quotation not found' };
    }

    const itemsResult = await this.databaseService.query<{
      id: number;
      productId: string | null;
      materialId: string | null;
      capacityId: string | null;
      productName: string | null;
      capacityName: string | null;
      unitPrice: string | null;
      sellPrice: string | null;
      discountPrice: string | null;
      unitTypesQty: unknown;
      totalSetQty: string | null;
      lineTotal: string | null;
      remarks: string | null;
    }>(
      `SELECT
         qi.id,
        qi.product_id::text AS "productId",
        qi.material_id::text AS "materialId",
         qi.capacity_id::text AS "capacityId",
         COALESCE(
           to_jsonb(p)->>'productName',
           to_jsonb(p)->>'product_name',
           to_jsonb(p)->>'productname',
           ''
         ) AS "productName",
         COALESCE(
           to_jsonb(c)->>'capacity',
           to_jsonb(c)->>'capacityValue',
           to_jsonb(c)->>'capacity_value',
           to_jsonb(c)->>'name',
           ''
         ) AS "capacityName",
         qi.unit_price::text AS "unitPrice",
         qi.sell_price::text AS "sellPrice",
         qi.discount_price::text AS "discountPrice",
         qi.unit_types_qty AS "unitTypesQty",
         qi.total_set_qty::text AS "totalSetQty",
         qi.line_total::text AS "lineTotal",
         qi.remarks
       FROM tblquotation_items qi
       LEFT JOIN tblproducts p
         ON p.id::text = qi.product_id::text
       LEFT JOIN tblcapacity c
         ON c.id::text = qi.capacity_id::text
       WHERE qi.quotation_id = $1
       ORDER BY qi.id ASC`,
      [id],
    );

    const quotation = quotationResult.rows[0];

    return {
      success: true,
      item: {
        id: quotation.id,
        quoteNo: String(quotation.quoteNo ?? '').trim(),
        quoteDate: quotation.quoteDate,
        customerId: quotation.customerId,
        customerName: String(quotation.customerName ?? '').trim(),
        customerAddress: String(quotation.customerAddress ?? '').trim(),
        customerContactPerson: String(quotation.customerContactPerson ?? '').trim(),
        customerContactNumber: String(quotation.customerContactNumber ?? '').trim(),
        customerEmail: String(quotation.customerEmail ?? '').trim(),
        customerTinNumber: String(quotation.customerTinNumber ?? '').trim(),
        totalAmount: Number(quotation.totalAmount ?? 0),
        validityDays: this.normalizeValidityDays(quotation.validityDays),
        status: String(quotation.status ?? 'draft').trim() || 'draft',
        remarks: String(quotation.remarks ?? '').trim(),
        termsConditions: (() => {
          const raw = quotation.termsConditions;
          if (!raw) return {};
          if (typeof raw === 'object') return raw;
          try { return JSON.parse(String(raw)); } catch { return {}; }
        })(),
        convertedSalesId: this.toOptionalNumber(quotation.convertedSalesId),
        expiresAt: quotation.expiresAt,
        expiredAt: quotation.expiredAt,
        isDeleted: Boolean(quotation.isDeleted),
        deletedAt: quotation.deletedAt,
        createdAt: quotation.createdAt,
        createdByName: String(quotation.createdByName ?? '').trim(),
        productItems: itemsResult.rows.map((item) => ({
          id: item.id,
          productId: item.productId,
          materialId: this.toOptionalNumber(item.materialId),
          capacityId: item.capacityId,
          productName: String(item.productName ?? '').trim(),
          capacityName: String(item.capacityName ?? '').trim(),
          unitPrice: Number(item.unitPrice ?? 0),
          sellPrice: Number(item.sellPrice ?? 0),
          discountPrice: Number(item.discountPrice ?? 0),
          unitTypesQty: Array.isArray(item.unitTypesQty)
            ? item.unitTypesQty
            : typeof item.unitTypesQty === 'string'
              ? (() => {
                  try {
                    const parsed = JSON.parse(item.unitTypesQty);
                    return Array.isArray(parsed) ? parsed : [];
                  } catch {
                    return [];
                  }
                })()
              : [],
          totalSetQty: Number(item.totalSetQty ?? 0),
          lineTotal: Number(item.lineTotal ?? 0),
          remarks: String(item.remarks ?? '').trim(),
        })),
      },
    };
  }

  async update(
    id: number,
    updateQuotationDto: UpdateQuotationDto,
    userId?: number,
    branchId?: number,
    auditActor?: AuditActorContext,
  ) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid quotation id' };
    }

    const productItems = Array.isArray(updateQuotationDto.productItems)
      ? updateQuotationDto.productItems
      : [];

    const beforeSnapshot = await this.getQuotationAuditSnapshot(id);

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        await this.softDeleteExpiredDraftQuotations(client);

        const existingResult = await client.query<{
          id: number;
          status: string | null;
          quoteDate: string | null;
          validityDays: string | null;
          isDeleted: boolean | null;
          customerName: string | null;
          customerAddress: string | null;
          customerContactPerson: string | null;
          customerContactNumber: string | null;
          customerEmail: string | null;
          customerTinNumber: string | null;
        }>(
          `SELECT
             id,
             status,
             quote_date::text AS "quoteDate",
             validity_days::text AS "validityDays",
             is_deleted AS "isDeleted",
             customer_name AS "customerName",
             customer_address AS "customerAddress",
             customer_contact_person AS "customerContactPerson",
             customer_contact_number AS "customerContactNumber",
             customer_email AS "customerEmail",
             customer_tin_number AS "customerTinNumber"
           FROM tblquotation
           WHERE id = $1
           LIMIT 1`,
          [id],
        );

        if (existingResult.rowCount === 0) {
          throw new Error('Quotation not found');
        }

        const currentStatus = this.normalizeStatus(existingResult.rows[0].status);
        if (currentStatus === 'converted') {
          throw new Error('Converted quotation can no longer be edited');
        }
        if (currentStatus === 'expired' || Boolean(existingResult.rows[0].isDeleted)) {
          throw new Error('Expired quotation can no longer be edited');
        }

        const patchRecord: Record<string, unknown> = {};
        const nextQuoteDate =
          this.toIsoDateOrNull(updateQuotationDto.quoteDate) ??
          existingResult.rows[0].quoteDate ??
          new Date().toISOString();
        const nextValidityDays =
          updateQuotationDto.validityDays !== undefined
            ? this.normalizeValidityDays(updateQuotationDto.validityDays)
            : this.normalizeValidityDays(existingResult.rows[0].validityDays);

        if (updateQuotationDto.quoteDate !== undefined) {
          patchRecord.quote_date = nextQuoteDate;
        }
        if (updateQuotationDto.validityDays !== undefined) {
          patchRecord.validity_days = nextValidityDays;
        }
        if (updateQuotationDto.remarks !== undefined) {
          patchRecord.remarks = String(updateQuotationDto.remarks ?? '').trim();
        }
        if (updateQuotationDto.termsConditions !== undefined) {
          patchRecord.terms_conditions = JSON.stringify({
            warrantyException: String(updateQuotationDto.termsConditions?.warrantyException ?? '').trim(),
            validity: String(updateQuotationDto.termsConditions?.validity ?? '').trim(),
            note: String(updateQuotationDto.termsConditions?.note ?? '').trim(),
            penaltyFee: String(updateQuotationDto.termsConditions?.penaltyFee ?? '').trim(),
            warranty: String(updateQuotationDto.termsConditions?.warranty ?? '').trim(),
          });
        }
        if (updateQuotationDto.status !== undefined) {
          patchRecord.status = this.normalizeStatus(updateQuotationDto.status);
        }

        if (updateQuotationDto.customer_id !== undefined || updateQuotationDto.customer !== undefined) {
          const customerId = await this.upsertCustomerFromPayload(client, {
            ...updateQuotationDto,
            productItems: productItems.length > 0 ? productItems : [{ totalSetQty: 0 }],
          } as CreateQuotationDto);
          const customerSnapshot = await this.getCustomerSnapshotById(client, customerId);

          const hasProvidedName = updateQuotationDto.customer?.name !== undefined;
          const hasProvidedAddress = updateQuotationDto.customer?.address !== undefined;
          const hasProvidedContactPerson = updateQuotationDto.customer?.contact_person !== undefined;
          const hasProvidedContactNumber = updateQuotationDto.customer?.contact_number !== undefined;
          const hasProvidedEmail = updateQuotationDto.customer?.email !== undefined;
          const hasProvidedTinNumber = updateQuotationDto.customer?.tin_number !== undefined;

          patchRecord.customer_id = customerId;
          patchRecord.customer_name = hasProvidedName
            ? String(updateQuotationDto.customer?.name ?? '').trim()
            : (customerSnapshot?.name || String(existingResult.rows[0].customerName ?? '').trim());
          patchRecord.customer_address = hasProvidedAddress
            ? String(updateQuotationDto.customer?.address ?? '').trim()
            : (customerSnapshot?.address || String(existingResult.rows[0].customerAddress ?? '').trim());
          patchRecord.customer_contact_person = hasProvidedContactPerson
            ? String(updateQuotationDto.customer?.contact_person ?? '').trim()
            : (customerSnapshot?.contactPerson || String(existingResult.rows[0].customerContactPerson ?? '').trim());
          patchRecord.customer_contact_number = hasProvidedContactNumber
            ? String(updateQuotationDto.customer?.contact_number ?? '').trim()
            : (customerSnapshot?.contactNumber || String(existingResult.rows[0].customerContactNumber ?? '').trim());
          patchRecord.customer_email = hasProvidedEmail
            ? String(updateQuotationDto.customer?.email ?? '').trim()
            : (customerSnapshot?.email || String(existingResult.rows[0].customerEmail ?? '').trim());
          patchRecord.customer_tin_number = hasProvidedTinNumber
            ? String(updateQuotationDto.customer?.tin_number ?? '').trim()
            : (customerSnapshot?.tinNumber || String(existingResult.rows[0].customerTinNumber ?? '').trim());
        }

        if (Number.isFinite(branchId)) {
          patchRecord.branch_id = branchId;
        }

        let totalAmount = this.toOptionalNumber(updateQuotationDto.totalAmount) ?? 0;
        if (productItems.length > 0) {
          const computedTotal = productItems.reduce((sum, item) => {
            const isMaterialItem = item.description || item.materialId != null || item.rate != null;

            if (isMaterialItem) {
              const rate = Number(item.rate ?? item.sellPrice ?? 0);
              const discount = Number(item.discount ?? item.discountPrice ?? 0);
              const qty = Number(item.qty ?? item.totalSetQty ?? 0);
              return sum + Math.max(0, rate - discount) * qty;
            }

            return sum + this.calculateItemLineTotal(item);
          }, 0);

          totalAmount = computedTotal > 0
            ? computedTotal
            : (this.toOptionalNumber(updateQuotationDto.totalAmount) ?? 0);
        }
        patchRecord.total_amount = totalAmount;
        patchRecord.expires_at = this.computeExpiresAt(nextQuoteDate, nextValidityDays);

        if (Object.keys(patchRecord).length > 0) {
          const entries = Object.entries(patchRecord);
          const setClause = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(', ');
          const values = entries.map(([, value]) => value);

          await client.query(
            `UPDATE tblquotation
             SET ${setClause}, updated_at = NOW()
             WHERE id = $${values.length + 1}`,
            [...values, id],
          );
        }

        if (productItems.length > 0) {
          await client.query(`DELETE FROM tblquotation_items WHERE quotation_id = $1`, [id]);

          for (const item of productItems) {
            const isMaterialItem = item.description || item.materialId != null || item.rate != null;

            let unitPrice: number;
            let sellPrice: number;
            let discountPrice: number;
            let totalSetQty: number;
            let lineTotal: number;
            let itemRemarks: string;
            let productId: number | null;
            let capacityId: number | null;

            if (isMaterialItem) {
              unitPrice = Number(item.cost ?? item.unitPrice ?? 0);
              sellPrice = Number(item.rate ?? item.sellPrice ?? 0);
              discountPrice = Number(item.discount ?? item.discountPrice ?? 0);
              totalSetQty = Number(item.qty ?? item.totalSetQty ?? 0);
              lineTotal = Math.max(0, sellPrice - discountPrice) * totalSetQty;
              productId = null;
              capacityId = null;

              const metadata: Record<string, unknown> = {
                type: 'material',
                materialId: this.resolveQuotationItemMaterialId(item),
                description: item.description ?? '',
                itemCode: item.itemCode ?? null,
                brand: item.brand ?? null,
                isNonInventory: item.isNonInventory ?? false,
              };
              itemRemarks = JSON.stringify(metadata);
            } else {
              unitPrice = this.toOptionalNumber(item.unitPrice) ?? 0;
              sellPrice = this.toOptionalNumber(item.sellPrice) ?? 0;
              discountPrice = this.toOptionalNumber(item.discountPrice) ?? 0;
              totalSetQty = this.toOptionalNumber(item.totalSetQty) ?? 0;
              lineTotal = this.calculateItemLineTotal(item);
              productId = this.toOptionalNumber(item.productId);
              capacityId = this.toOptionalNumber(item.capacityId);
              itemRemarks = String(item.remarks ?? '').trim();
            }

            await this.runInsert(client, 'tblquotation_items', {
              quotation_id: id,
              material_id: this.resolveQuotationItemMaterialId(item),
              product_id: productId,
              capacity_id: capacityId,
              unit_price: unitPrice,
              sell_price: sellPrice,
              discount_price: discountPrice,
              unit_types_qty: JSON.stringify(item.unitTypesQty ?? []),
              total_set_qty: totalSetQty,
              line_total: lineTotal,
              remarks: itemRemarks,
            });
          }
        }

        return {
          quotationId: id,
          totalAmount,
          status: String(patchRecord.status ?? currentStatus),
          updatedBy: Number.isFinite(userId) ? userId : null,
        };
      });

      const afterSnapshot = await this.getQuotationAuditSnapshot(id);
      await this.auditLogService.logMutation({
        action: 'QUOTATION_UPDATE',
        entityType: 'quotation',
        entityId: id,
        actor: auditActor ?? { userId, branchId },
        description: `Updated quotation ${String((afterSnapshot?.quoteNo as string | undefined) ?? '').trim() || `#${id}`}`,
        requestBody: updateQuotationDto as Record<string, unknown>,
        before: beforeSnapshot,
        after: afterSnapshot,
        metadata: {
          status: result.status,
          totalAmount: result.totalAmount,
        },
      });

      return {
        success: true,
        message: 'Quotation updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update quotation',
      };
    }
  }

  async finalize(id: number, auditActor?: AuditActorContext) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid quotation id' };
    }

    const beforeSnapshot = await this.getQuotationAuditSnapshot(id);

    await this.softDeleteExpiredDraftQuotations(this.getDatabaseExecutor());

    const result = await this.databaseService.query(
      `UPDATE tblquotation
       SET status = 'finalized', updated_at = NOW()
       WHERE id = $1
         AND COALESCE(is_deleted, false) = false
         AND (expires_at IS NULL OR expires_at > NOW())
         AND LOWER(COALESCE(status, 'draft')) IN ('draft', 'finalized')
       RETURNING id, quote_no, status`,
      [id],
    );

    if (result.rowCount === 0) {
      return { success: false, message: 'Quotation not found or not allowed to finalize' };
    }

    const afterSnapshot = await this.getQuotationAuditSnapshot(Number(result.rows[0].id));
    await this.auditLogService.logMutation({
      action: 'QUOTATION_FINALIZE',
      entityType: 'quotation',
      entityId: Number(result.rows[0].id),
      actor: auditActor,
      description: `Finalized quotation ${String(result.rows[0].quote_no ?? '').trim() || `#${id}`}`,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        quoteNo: result.rows[0].quote_no,
        status: result.rows[0].status,
      },
    });

    return {
      success: true,
      message: 'Quotation finalized successfully',
      data: {
        quotationId: Number(result.rows[0].id),
        quoteNo: result.rows[0].quote_no,
        status: result.rows[0].status,
      },
    };
  }

  async convertToSalesOrder(
    id: number,
    userId?: number,
    branchId?: number,
    auditActor?: AuditActorContext,
  ) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid quotation id' };
    }

    this.logger.log(
      `[convertToSalesOrder] START quotationId=${id} userId=${String(userId ?? '')} branchId=${String(branchId ?? '')}`,
    );
    console.log(
      `[convertToSalesOrder] START quotationId=${id} userId=${String(userId ?? '')} branchId=${String(branchId ?? '')}`,
    );

    const beforeSnapshot = await this.getQuotationAuditSnapshot(id);

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        this.logger.log(`[convertToSalesOrder] [${id}] step=softDeleteExpiredDraftQuotations:start`);
        console.log(`[convertToSalesOrder] [${id}] step=softDeleteExpiredDraftQuotations:start`);
        await this.softDeleteExpiredDraftQuotations(client);
        this.logger.log(`[convertToSalesOrder] [${id}] step=softDeleteExpiredDraftQuotations:done`);
        console.log(`[convertToSalesOrder] [${id}] step=softDeleteExpiredDraftQuotations:done`);
        this.logger.log(`[convertToSalesOrder] [${id}] step=loadQuotation:start`);
        console.log(`[convertToSalesOrder] [${id}] step=loadQuotation:start`);
        const quotationResult = await client.query<{
          id: number;
          quoteNo: string | null;
          quoteDate: string | null;
          customerId: string | null;
          customerName: string | null;
          customerAddress: string | null;
          customerContactPerson: string | null;
          customerContactNumber: string | null;
          customerEmail: string | null;
          customerTinNumber: string | null;
          totalAmount: string | null;
          status: string | null;
          remarks: string | null;
          convertedSalesId: string | null;
          isDeleted: boolean | null;
        }>(
          `SELECT
             q.id,
             COALESCE(to_jsonb(q)->>'quote_no', to_jsonb(q)->>'quoteNo', null) AS "quoteNo",
             COALESCE(to_jsonb(q)->>'quote_date', to_jsonb(q)->>'quoteDate', null) AS "quoteDate",
             COALESCE(to_jsonb(q)->>'customer_id', to_jsonb(q)->>'customerId', null) AS "customerId",
             COALESCE(to_jsonb(q)->>'customer_name', to_jsonb(q)->>'customerName', null) AS "customerName",
             COALESCE(to_jsonb(q)->>'customer_address', to_jsonb(q)->>'customerAddress', null) AS "customerAddress",
             COALESCE(to_jsonb(q)->>'customer_contact_person', to_jsonb(q)->>'customerContactPerson', null) AS "customerContactPerson",
             COALESCE(to_jsonb(q)->>'customer_contact_number', to_jsonb(q)->>'customerContactNumber', null) AS "customerContactNumber",
             COALESCE(to_jsonb(q)->>'customer_email', to_jsonb(q)->>'customerEmail', null) AS "customerEmail",
             COALESCE(to_jsonb(q)->>'customer_tin_number', to_jsonb(q)->>'customerTinNumber', null) AS "customerTinNumber",
             COALESCE(to_jsonb(q)->>'total_amount', to_jsonb(q)->>'totalAmount', null) AS "totalAmount",
             COALESCE(to_jsonb(q)->>'status', null) AS status,
             COALESCE(to_jsonb(q)->>'remarks', null) AS remarks,
             COALESCE(to_jsonb(q)->>'converted_sales_id', to_jsonb(q)->>'convertedSalesId', null) AS "convertedSalesId",
             COALESCE(NULLIF(to_jsonb(q)->>'is_deleted', ''), 'false')::boolean AS "isDeleted"
           FROM tblquotation q
           WHERE q.id = $1
           LIMIT 1`,
          [id],
        );
        this.logger.log(
          `[convertToSalesOrder] [${id}] step=loadQuotation:done rowCount=${quotationResult.rowCount}`,
        );
        console.log(
          `[convertToSalesOrder] [${id}] step=loadQuotation:done rowCount=${quotationResult.rowCount}`,
        );
        if (quotationResult.rowCount === 0) {
          this.logger.warn(`[convertToSalesOrder] [${id}] step=loadQuotation:not-found`);
          throw new Error('Quotation not found');
        }

        const quotation = quotationResult.rows[0];
        const status = this.normalizeStatus(quotation.status);
        this.logger.log(
          `[convertToSalesOrder] [${id}] step=validateQuotationStatus status=${status} isDeleted=${Boolean(quotation.isDeleted)} convertedSalesId=${String(quotation.convertedSalesId ?? '')}`,
        );
        console.log(
          `[convertToSalesOrder] [${id}] step=validateQuotationStatus status=${status} isDeleted=${Boolean(quotation.isDeleted)} convertedSalesId=${String(quotation.convertedSalesId ?? '')}`,
        );

        if (status === 'expired' || Boolean(quotation.isDeleted)) {
          throw new Error('Expired quotation can no longer be converted to Sales Order');
        }

        if (status === 'converted' && this.toOptionalNumber(quotation.convertedSalesId)) {
          return {
            quotationId: id,
            salesOrderId: this.toOptionalNumber(quotation.convertedSalesId),
            alreadyConverted: true,
          };
        }

        if (status !== 'finalized') {
          throw new Error('Only finalized quotations can be converted to Sales Order');
        }

        this.logger.log(`[convertToSalesOrder] [${id}] step=loadQuotationItems:start`);
        console.log(`[convertToSalesOrder] [${id}] step=loadQuotationItems:start`);
        const itemsResult = await client.query<{
          id: number;
          materialId: string | null;
          productId: string | null;
          capacityId: string | null;
          unitPrice: string | null;
          sellPrice: string | null;
          discountPrice: string | null;
          unitTypesQty: unknown;
          totalSetQty: string | null;
          lineTotal: string | null;
          remarks: string | null;
        }>(
          `SELECT
             qi.id,
             COALESCE(to_jsonb(qi)->>'material_id', to_jsonb(qi)->>'materialId', null) AS "materialId",
             COALESCE(to_jsonb(qi)->>'product_id', to_jsonb(qi)->>'productId', null) AS "productId",
             COALESCE(to_jsonb(qi)->>'capacity_id', to_jsonb(qi)->>'capacityId', null) AS "capacityId",
             COALESCE(to_jsonb(qi)->>'unit_price', to_jsonb(qi)->>'unitPrice', null) AS "unitPrice",
             COALESCE(to_jsonb(qi)->>'sell_price', to_jsonb(qi)->>'sellPrice', null) AS "sellPrice",
             COALESCE(to_jsonb(qi)->>'discount_price', to_jsonb(qi)->>'discountPrice', null) AS "discountPrice",
             COALESCE(to_jsonb(qi)->'unit_types_qty', to_jsonb(qi)->'unitTypesQty', '[]'::jsonb) AS "unitTypesQty",
             COALESCE(to_jsonb(qi)->>'total_set_qty', to_jsonb(qi)->>'totalSetQty', null) AS "totalSetQty",
             COALESCE(to_jsonb(qi)->>'line_total', to_jsonb(qi)->>'lineTotal', null) AS "lineTotal",
             COALESCE(to_jsonb(qi)->>'remarks', null) AS remarks
           FROM tblquotation_items qi
           WHERE COALESCE(to_jsonb(qi)->>'quotation_id', to_jsonb(qi)->>'quotationId') = $1
           ORDER BY qi.id ASC`,
          [String(id)],
        );
        this.logger.log(
          `[convertToSalesOrder] [${id}] step=loadQuotationItems:done itemCount=${itemsResult.rowCount}`,
        );
        console.log(
          `[convertToSalesOrder] [${id}] step=loadQuotationItems:done itemCount=${itemsResult.rowCount}`,
        );

        if (itemsResult.rowCount === 0) {
          throw new Error('Quotation has no line items');
        }

        const customerPayload: CreateQuotationDto = {
          customer_id: quotation.customerId,
          customer: {
            name: String(quotation.customerName ?? '').trim(),
            address: String(quotation.customerAddress ?? '').trim(),
            contact_person: String(quotation.customerContactPerson ?? '').trim(),
            contact_number: String(quotation.customerContactNumber ?? '').trim(),
            email: String(quotation.customerEmail ?? '').trim(),
            tin_number: String(quotation.customerTinNumber ?? '').trim(),
          },
          productItems: [],
        };

        this.logger.log(`[convertToSalesOrder] [${id}] step=upsertCustomer:start`);
        const customerId = await this.upsertCustomerFromPayload(client, customerPayload);
        this.logger.log(
          `[convertToSalesOrder] [${id}] step=upsertCustomer:done customerId=${customerId}`,
        );

        this.logger.log(`[convertToSalesOrder] [${id}] step=resolveSalesColumns:start`);
        const salesColumns = await this.getTableColumns(client, 'tblsales_order');
        const salesCustomerIdColumn = this.pickColumn(salesColumns, ['customer_id', 'customerId']);
        const totalAmountColumn = this.pickColumn(salesColumns, ['total_amount', 'totalAmount']);
        const scheduleDateColumn = this.pickColumn(salesColumns, ['scheduleDate', 'schedule_date']);
        const salesTypeColumn = this.pickColumn(salesColumns, ['salesType', 'sales_type']);
        const remarksColumn = this.pickColumn(salesColumns, ['remarks']);
        const statusColumn = this.pickColumn(salesColumns, ['status']);
        const createdByColumn = this.pickColumn(salesColumns, ['created_by', 'createdBy']);
        const branchColumn = this.pickColumn(salesColumns, ['branchId', 'branch_id']);
        this.logger.log(
          `[convertToSalesOrder] [${id}] step=resolveSalesColumns:done hasCustomerIdColumn=${Boolean(salesCustomerIdColumn)} hasTotalAmountColumn=${Boolean(totalAmountColumn)} hasStatusColumn=${Boolean(statusColumn)}`,
        );

        if (!salesCustomerIdColumn || !totalAmountColumn || !statusColumn) {
          throw new Error('tblsales_order columns are not aligned with expected fields');
        }

        const salesRecord: Record<string, unknown> = {
          [salesCustomerIdColumn]: customerId,
          [totalAmountColumn]: this.toOptionalNumber(quotation.totalAmount) ?? 0,
          [statusColumn]: 'pending',
        };

        if (scheduleDateColumn) {
          salesRecord[scheduleDateColumn] = this.toIsoDateOrNull(quotation.quoteDate) ?? new Date().toISOString();
        }
        if (salesTypeColumn) {
          salesRecord[salesTypeColumn] = 'sales';
        }
        if (remarksColumn) {
          salesRecord[remarksColumn] = String(quotation.remarks ?? '').trim() || `Converted from quotation #${quotation.quoteNo ?? id}`;
        }
        if (createdByColumn && Number.isFinite(userId)) {
          salesRecord[createdByColumn] = userId;
        }
        if (branchColumn && Number.isFinite(branchId)) {
          salesRecord[branchColumn] = branchId;
        }

        this.logger.log(`[convertToSalesOrder] [${id}] step=insertSalesOrder:start`);
        const insertedSales = await this.runInsert(client, 'tblsales_order', salesRecord);
        if (insertedSales.rowCount === 0) {
          throw new Error('Failed to create sales order from quotation');
        }

        const salesOrderId = Number(insertedSales.rows[0].id);
        this.logger.log(
          `[convertToSalesOrder] [${id}] step=insertSalesOrder:done salesOrderId=${salesOrderId}`,
        );

        this.logger.log(`[convertToSalesOrder] [${id}] step=resolveTransactionItemColumns:start`);
        const transactionItemColumns = await this.getTableColumns(client, 'tbltransaction_product_items');
        this.logger.log(
          `[convertToSalesOrder] [${id}] step=resolveTransactionItemColumns:done columnCount=${transactionItemColumns.length}`,
        );
        if (transactionItemColumns.length === 0) {
          throw new Error('tbltransaction_product_items table is missing');
        }

        const transTypeColumn = this.pickColumn(transactionItemColumns, ['transType', 'trans_type']);
        const productIdColumn = this.pickColumn(transactionItemColumns, ['productId', 'product_id']);
        const capacityIdColumn = this.pickColumn(transactionItemColumns, ['capacityId', 'capacity_id']);
        const unitPriceColumn = this.pickColumn(transactionItemColumns, ['unitPrice', 'unit_price']);
        const sellPriceColumn = this.pickColumn(transactionItemColumns, ['sellPrice', 'sell_price']);
        const discountPriceColumn = this.pickColumn(transactionItemColumns, ['discountPrice', 'discount_price']);
        const unitTypesQtyColumn = this.pickColumn(transactionItemColumns, ['unitTypesQty', 'unit_types_qty']);
        const totalSetQtyColumn = this.pickColumn(transactionItemColumns, ['totalSetQty', 'total_set_qty']);
        const purchaseIdColumn = this.pickColumn(transactionItemColumns, ['purchaseId', 'purchase_id', 'po_id']);
        const salesIdColumn = this.pickColumn(transactionItemColumns, ['salesId', 'sales_id']);
        const itemStatusColumn = this.pickColumn(transactionItemColumns, ['status']);

        type MaterialSalesOrderItemInsert = {
          materialId: number | null;
          description: string;
          itemCode: string | null;
          brand: string | null;
          cost: number;
          rate: number;
          discount: number;
          qty: number;
          total: number;
          isNonInventory: boolean;
        };
        const materialItems: MaterialSalesOrderItemInsert[] = [];

        for (const [itemIndex, item] of itemsResult.rows.entries()) {
          const parsedProductId = this.toOptionalNumber(item.productId);
          const parsedCapacityId = this.toOptionalNumber(item.capacityId);
          const materialMeta = this.parseMaterialMetadataFromRemarks(item.remarks);
          const materialId = this.toOptionalNumber(item.materialId) ?? materialMeta.materialId;
          const shouldTreatAsMaterial = materialId !== null || materialMeta.isMaterial || (parsedProductId === null && parsedCapacityId === null);

          if (shouldTreatAsMaterial) {
            const qty = this.toOptionalNumber(item.totalSetQty) ?? 0;
            const cost = this.toOptionalNumber(item.unitPrice) ?? 0;
            const rate = this.toOptionalNumber(item.sellPrice) ?? 0;
            const discount = this.toOptionalNumber(item.discountPrice) ?? 0;
            const total = this.toOptionalNumber(item.lineTotal) ?? Math.max(rate - discount, 0) * qty;

            materialItems.push({
              materialId,
              description: materialMeta.description,
              itemCode: materialMeta.itemCode,
              brand: materialMeta.brand,
              cost,
              rate,
              discount,
              qty,
              total,
              isNonInventory: materialMeta.isNonInventory || materialId === null,
            });

            this.logger.log(
              `[convertToSalesOrder] [${id}] step=classifyQuotationItem:material index=${itemIndex} materialId=${String(materialMeta.materialId ?? '')}`,
            );
            continue;
          }

          if (parsedProductId === null || parsedCapacityId === null) {
            throw new Error(
              `Quotation item index ${itemIndex} is missing product/capacity mapping. If this is a material line, ensure remarks metadata has {"type":"material"}.`,
            );
          }

          this.logger.log(
            `[convertToSalesOrder] [${id}] step=insertTransactionItem:start index=${itemIndex} productId=${parsedProductId} capacityId=${parsedCapacityId}`,
          );
          const transactionItemRecord: Record<string, unknown> = {};
          if (transTypeColumn) transactionItemRecord[transTypeColumn] = 'sales';
          if (productIdColumn) transactionItemRecord[productIdColumn] = parsedProductId;
          if (capacityIdColumn) transactionItemRecord[capacityIdColumn] = parsedCapacityId;
          if (unitPriceColumn) transactionItemRecord[unitPriceColumn] = this.toOptionalNumber(item.unitPrice) ?? 0;
          if (sellPriceColumn) transactionItemRecord[sellPriceColumn] = this.toOptionalNumber(item.sellPrice) ?? 0;
          if (discountPriceColumn) transactionItemRecord[discountPriceColumn] = this.toOptionalNumber(item.discountPrice) ?? 0;
          if (unitTypesQtyColumn) {
            transactionItemRecord[unitTypesQtyColumn] =
              typeof item.unitTypesQty === 'string'
                ? item.unitTypesQty
                : JSON.stringify(item.unitTypesQty ?? []);
          }
          if (totalSetQtyColumn) transactionItemRecord[totalSetQtyColumn] = this.toOptionalNumber(item.totalSetQty) ?? 0;
          if (purchaseIdColumn) transactionItemRecord[purchaseIdColumn] = null;
          if (salesIdColumn) transactionItemRecord[salesIdColumn] = salesOrderId;
          if (itemStatusColumn) transactionItemRecord[itemStatusColumn] = 'pending';

          await this.runInsert(client, 'tbltransaction_product_items', transactionItemRecord);
          this.logger.log(
            `[convertToSalesOrder] [${id}] step=insertTransactionItem:done index=${itemIndex}`,
          );
        }

        if (materialItems.length > 0) {
          this.logger.log(
            `[convertToSalesOrder] [${id}] step=insertMaterialSalesItems:start count=${materialItems.length}`,
          );

          for (const [materialIndex, materialItem] of materialItems.entries()) {
            if (!materialItem.itemCode || materialItem.itemCode.trim().toLowerCase() === 'others') {
              await client.query(
                `INSERT INTO tblsales_order_items
                  (sales_order_id, description, item_code, brand, cost, rate, discount, qty, total, is_non_inventory)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  salesOrderId,
                  materialItem.description,
                  materialItem.itemCode,
                  materialItem.brand,
                  materialItem.cost,
                  materialItem.rate,
                  materialItem.discount,
                  materialItem.qty,
                  materialItem.total,
                  true,
                ],
              );
            } else {
              await client.query(
                `INSERT INTO tblsales_order_items
                  (sales_order_id, material_id, description, item_code, brand, cost, rate, discount, qty, total, is_non_inventory)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                  salesOrderId,
                  materialItem.materialId,
                  materialItem.description,
                  materialItem.itemCode,
                  materialItem.brand,
                  materialItem.cost,
                  materialItem.rate,
                  materialItem.discount,
                  materialItem.qty,
                  materialItem.total,
                  materialItem.isNonInventory,
                ],
              );
            }

            this.logger.log(
              `[convertToSalesOrder] [${id}] step=insertMaterialSalesItem:done index=${materialIndex}`,
            );
          }

          this.logger.log(`[convertToSalesOrder] [${id}] step=insertMaterialSalesItems:done`);
        }

        this.logger.log(`[convertToSalesOrder] [${id}] step=markQuotationConverted:start`);
        const quotationColumns = await this.getTableColumns(client, 'tblquotation');
        const quotationStatusColumn = this.pickColumn(quotationColumns, ['status']);
        const convertedSalesIdColumn = this.pickColumn(quotationColumns, ['converted_sales_id', 'convertedSalesId']);
        const updatedAtColumn = this.pickColumn(quotationColumns, ['updated_at', 'updatedAt']);

        if (!quotationStatusColumn || !convertedSalesIdColumn) {
          throw new Error('tblquotation columns are not aligned with expected conversion fields');
        }

        const updateSetClauses: string[] = [
          `"${quotationStatusColumn}" = $1`,
          `"${convertedSalesIdColumn}" = $2`,
        ];
        const updateParams: unknown[] = ['converted', salesOrderId];

        if (updatedAtColumn) {
          updateSetClauses.push(`"${updatedAtColumn}" = NOW()`);
        }

        updateParams.push(id);
        await client.query(
          `UPDATE tblquotation
           SET ${updateSetClauses.join(', ')}
           WHERE id = $${updateParams.length}`,
          updateParams,
        );
        this.logger.log(`[convertToSalesOrder] [${id}] step=markQuotationConverted:done`);

        this.logger.log(
          `[convertToSalesOrder] [${id}] COMPLETE salesOrderId=${salesOrderId}`,
        );
        return {
          quotationId: id,
          salesOrderId,
          alreadyConverted: false,
        };
      });

      const afterSnapshot = await this.getQuotationAuditSnapshot(id);
      await this.auditLogService.logMutation({
        action: 'QUOTATION_CONVERT_TO_SALES_ORDER',
        entityType: 'quotation',
        entityId: id,
        actor: auditActor ?? { userId, branchId },
        description: result.alreadyConverted
          ? `Quotation #${id} was already converted to sales order #${result.salesOrderId}`
          : `Converted quotation #${id} to sales order #${result.salesOrderId}`,
        before: beforeSnapshot,
        after: {
          ...(afterSnapshot ?? {}),
          salesOrderId: result.salesOrderId,
          alreadyConverted: result.alreadyConverted,
        },
      });

      return {
        success: true,
        message: result.alreadyConverted
          ? 'Quotation is already converted'
          : 'Quotation converted to Sales Order successfully',
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown conversion error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[convertToSalesOrder] FAILED quotationId=${id} message=${message}`,
        stack,
      );

      return {
        success: false,
        message: message || 'Failed to convert quotation to Sales Order',
      };
    }
  }

  async permanentDelete(
    id: number,
    password: string,
    userId?: number,
    roleName?: string,
    auditActor?: AuditActorContext,
  ) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid quotation id' };
    }

    const effectiveUserId = Number(userId);
    if (!Number.isFinite(effectiveUserId) || effectiveUserId <= 0) {
      return { success: false, message: 'Invalid current user' };
    }

    const normalizedPassword = String(password ?? '').trim();
    if (!normalizedPassword) {
      return { success: false, message: 'Admin password is required' };
    }

    const normalizedRoleName = String(roleName ?? '').trim().toLowerCase();
    if (
      !normalizedRoleName.includes('admin') &&
      !normalizedRoleName.includes('super') &&
      !normalizedRoleName.includes('owner')
    ) {
      return {
        success: false,
        message: 'Only admin, super admin, or business owner can permanently delete expired quotations',
      };
    }

    const passwordSha1 = createHash('sha1').update(normalizedPassword).digest('hex');

    const adminCheck = await this.databaseService.query<{ id: number }>(
      `SELECT u.id
       FROM tblusers u
       LEFT JOIN tblrbac r
         ON r.id::text = COALESCE(
           to_jsonb(u)->>'roleId',
           to_jsonb(u)->>'roleid',
           to_jsonb(u)->>'role_id'
         )
       WHERE u.id = $1
         AND u.password = $2
         AND (
           LOWER(COALESCE(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%admin%'
           OR LOWER(COALESCE(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%super%'
           OR LOWER(COALESCE(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%owner%'
         )
       LIMIT 1`,
      [effectiveUserId, passwordSha1],
    );

    if (adminCheck.rowCount === 0) {
      return { success: false, message: 'Invalid admin password' };
    }

    const beforeSnapshot = await this.getQuotationAuditSnapshot(id);

    const deleteResult = await this.databaseService.query<{ id: number }>(
      `DELETE FROM tblquotation
       WHERE id = $1
         AND (COALESCE(is_deleted, false) = true OR LOWER(COALESCE(status, '')) = 'expired')
       RETURNING id`,
      [id],
    );

    if (deleteResult.rowCount === 0) {
      return { success: false, message: 'Expired quotation not found or already deleted' };
    }

    await this.auditLogService.logMutation({
      action: 'QUOTATION_PERMANENT_DELETE',
      entityType: 'quotation',
      entityId: id,
      actor: auditActor ?? { userId: effectiveUserId, roleName },
      description: `Permanently deleted quotation #${id}`,
      before: beforeSnapshot,
      metadata: { passwordVerified: true },
    });

    return {
      success: true,
      message: 'Expired quotation permanently deleted',
      data: {
        quotationId: Number(deleteResult.rows[0].id),
      },
    };
  }
}
