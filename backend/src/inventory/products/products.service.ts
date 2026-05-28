import { Injectable } from '@nestjs/common';
import {
  CreateProductCapacityDto,
  CreateProductDto,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { DatabaseService } from 'src/database/database.service';
import { PoolClient } from 'pg';

@Injectable()
export class ProductsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async getTableColumns(
    executor: { query: PoolClient['query'] },
    tableName: string,
  ): Promise<string[]> {
    const columnsResult = await executor.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = $1
         AND table_schema = current_schema()`,
      [tableName],
    );

    return columnsResult.rows.map((row) => row.column_name);
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

  private async insertCapacityAndPriceHistory(
    executor: { query: PoolClient['query'] },
    productId: number,
    userId: number,
    capacityItem: CreateProductCapacityDto,
  ) {
    const toOptionalNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const toRequiredNumber = (value: unknown, fieldName: string): number => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${fieldName} must be a valid number`);
      }
      return parsed;
    };

    const supplierId = toOptionalNumber(capacityItem.supplierId);
    const purchaseOrderId = toOptionalNumber(capacityItem.purchaseOrderId);
    const purchaseOrderNo =
      typeof capacityItem.purchaseOrderNo === 'string'
        ? capacityItem.purchaseOrderNo.trim()
        : '';
    const srp = toRequiredNumber(capacityItem.srp, 'srp');
    const netPrice = toRequiredNumber(capacityItem.netPrice, 'netPrice');
    const cashPrice = toOptionalNumber(capacityItem.cashPrice);
    const ccPrice = toOptionalNumber(capacityItem.ccPrice);
    const unitPrice = toOptionalNumber(capacityItem.unitPrice);

    const capacityColumns = await this.getTableColumns(executor, 'tblcapacity');
    if (capacityColumns.length === 0) {
      throw new Error('tblcapacity table was not found in current schema');
    }

    const capacityProductIdColumn = this.pickColumn(capacityColumns, [
      'prodId',
      'productId',
      'prod_id',
      'product_id',
    ]);
    const capacityValueColumn = this.pickColumn(capacityColumns, [
      'capacity',
      'capacityValue',
    ]);
    const indoorModelColumn = this.pickColumn(capacityColumns, [
      'indoorModel',
      'indoor_model',
    ]);
    const outdoorModelColumn = this.pickColumn(capacityColumns, [
      'outdoorModel',
      'outdoor_model',
    ]);
    const srpColumn = this.pickColumn(capacityColumns, ['srp', 'SRP']);
    const netPriceColumn = this.pickColumn(capacityColumns, [
      'netPrice',
      'net_price',
    ]);
    const cashPriceColumn = this.pickColumn(capacityColumns, [
      'cashPrice',
      'cash_price',
      'cashprice',
    ]);
    const ccPriceColumn = this.pickColumn(capacityColumns, [
      'ccPrice',
      'cc_price',
      'ccprice',
    ]);
    const unitPriceColumn = this.pickColumn(capacityColumns, [
      'unitPrice',
      'unit_price',
      'unitprice',
    ]);
    const supplierIdColumn = this.pickColumn(capacityColumns, [
      'supplierId',
      'supplier_id',
    ]);
    const purchaseOrderIdColumn = this.pickColumn(capacityColumns, [
      'purchaseOrderId',
      'purchase_order_id',
      'poId',
      'po_id',
    ]);
    const purchaseOrderNoColumn = this.pickColumn(capacityColumns, [
      'purchaseOrderNo',
      'purchase_order_no',
      'poNo',
      'po_no',
    ]);
    const createdByColumn = this.pickColumn(capacityColumns, [
      'created_by',
      'createdBy',
      'createdby',
    ]);

    if (
      !capacityProductIdColumn ||
      !capacityValueColumn ||
      !indoorModelColumn ||
      !outdoorModelColumn ||
      !srpColumn ||
      !netPriceColumn
    ) {
      throw new Error(
        'tblcapacity columns are not aligned with required fields',
      );
    }

    const capacityRecord: Record<string, unknown> = {
      [capacityProductIdColumn]: productId,
      [capacityValueColumn]: capacityItem.capacity,
      [indoorModelColumn]: capacityItem.indoorModel,
      [outdoorModelColumn]: capacityItem.outdoorModel,
      [srpColumn]: srp,
      [netPriceColumn]: netPrice,
    };

    if (cashPriceColumn && cashPrice != null) {
      capacityRecord[cashPriceColumn] = cashPrice;
    }

    if (ccPriceColumn && ccPrice != null) {
      capacityRecord[ccPriceColumn] = ccPrice;
    }

    if (unitPriceColumn && unitPrice != null) {
      capacityRecord[unitPriceColumn] = unitPrice;
    }

    if (supplierIdColumn && supplierId != null) {
      capacityRecord[supplierIdColumn] = supplierId;
    }
    if (purchaseOrderIdColumn && purchaseOrderId != null) {
      capacityRecord[purchaseOrderIdColumn] = purchaseOrderId;
    }
    if (purchaseOrderNoColumn && purchaseOrderNo) {
      capacityRecord[purchaseOrderNoColumn] = purchaseOrderNo;
    }
    if (createdByColumn) {
      capacityRecord[createdByColumn] = userId;
    }

    await this.runInsert(executor, 'tblcapacity', capacityRecord);

    const historyColumns = await this.getTableColumns(
      executor,
      'tblcapacity_netprice_history',
    );

    if (historyColumns.length === 0) {
      return;
    }

    const historyProductIdColumn = this.pickColumn(historyColumns, [
      'prodId',
      'productId',
      'prod_id',
      'product_id',
    ]);
    const historyCapacityColumn = this.pickColumn(historyColumns, [
      'capacity',
      'capacityValue',
      'capacity_value',
    ]);
    const historyNetPriceColumn = this.pickColumn(historyColumns, [
      'netPrice',
      'net_price',
    ]);
    const historySupplierIdColumn = this.pickColumn(historyColumns, [
      'supplierId',
      'supplier_id',
    ]);
    const historyPurchaseOrderIdColumn = this.pickColumn(historyColumns, [
      'purchaseOrderId',
      'purchase_order_id',
      'poId',
      'po_id',
    ]);
    const historyPurchaseOrderNoColumn = this.pickColumn(historyColumns, [
      'purchaseOrderNo',
      'purchase_order_no',
      'poNo',
      'po_no',
    ]);
    const historyCreatedByColumn = this.pickColumn(historyColumns, [
      'created_by',
      'createdBy',
      'createdby',
    ]);

    if (!historyProductIdColumn || !historyCapacityColumn || !historyNetPriceColumn) {
      return;
    }

    const whereClauses = [
      `"${historyProductIdColumn}"::text = $1::text`,
      `"${historyCapacityColumn}"::text = $2::text`,
    ];
    const whereValues: unknown[] = [productId, capacityItem.capacity];

    if (historySupplierIdColumn && supplierId != null) {
      whereValues.push(supplierId);
      whereClauses.push(
        `"${historySupplierIdColumn}"::text = $${whereValues.length}::text`,
      );
    }

    if (historyPurchaseOrderIdColumn && purchaseOrderId != null) {
      whereValues.push(purchaseOrderId);
      whereClauses.push(
        `"${historyPurchaseOrderIdColumn}"::text = $${whereValues.length}::text`,
      );
    }

    if (historyPurchaseOrderNoColumn && purchaseOrderNo) {
      whereValues.push(purchaseOrderNo);
      whereClauses.push(
        `LOWER(TRIM("${historyPurchaseOrderNoColumn}"::text)) = LOWER(TRIM($${whereValues.length}::text))`,
      );
    }

    const latestPriceResult = await executor.query<{ net_price_value: string | null }>(
      `SELECT "${historyNetPriceColumn}"::text AS net_price_value
       FROM tblcapacity_netprice_history
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY id DESC
       LIMIT 1`,
      whereValues,
    );

    const latestNetPrice = latestPriceResult.rows[0]?.net_price_value;
    const incomingNetPrice = String(netPrice);

    if (latestNetPrice === incomingNetPrice) {
      return;
    }

    const historyRecord: Record<string, unknown> = {
      [historyProductIdColumn]: productId,
      [historyCapacityColumn]: capacityItem.capacity,
      [historyNetPriceColumn]: netPrice,
    };

    if (historySupplierIdColumn && supplierId != null) {
      historyRecord[historySupplierIdColumn] = supplierId;
    }
    if (historyPurchaseOrderIdColumn && purchaseOrderId != null) {
      historyRecord[historyPurchaseOrderIdColumn] = purchaseOrderId;
    }
    if (historyPurchaseOrderNoColumn && purchaseOrderNo) {
      historyRecord[historyPurchaseOrderNoColumn] = purchaseOrderNo;
    }
    if (historyCreatedByColumn) {
      historyRecord[historyCreatedByColumn] = userId;
    }

    await this.runInsert(executor, 'tblcapacity_netprice_history', historyRecord);
  }

  async create(createProductDto: CreateProductDto, userId: number) {
    const prodData = createProductDto;
    const normalizedProductName = prodData.productName?.trim();

    if (!normalizedProductName) {
      return {
        success: false,
        message: 'Product name is required',
      };
    }

    const duplicateCheck = await this.databaseService.query<{ id: number }>(
      `SELECT id
       FROM tblproducts p
       WHERE LOWER(TRIM(COALESCE(
         to_jsonb(p)->>'productName',
         to_jsonb(p)->>'product_name',
         to_jsonb(p)->>'productname',
         ''
       ))) = LOWER(TRIM($1))
       AND COALESCE(
         to_jsonb(p)->>'brandId',
         to_jsonb(p)->>'brand_id',
         to_jsonb(p)->>'brandid'
       ) = $2::text
       LIMIT 1`,
      [normalizedProductName, prodData.brandId],
    );

    if (duplicateCheck.rowCount > 0) {
      return {
        success: false,
        message: 'Product already exists for this brand',
      };
    }

    const payload = {
      ...prodData,
      productName: normalizedProductName,
      unitTypes: prodData.unitTypes.join(','),
      created_by: userId,
    };

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        const availableColumns = await this.getTableColumns(client, 'tblproducts');

        const brandColumn = this.pickColumn(availableColumns, [
          'brandId',
          'brand_id',
          'brandid',
        ]);
        const productNameColumn = this.pickColumn(availableColumns, [
          'productName',
          'product_name',
          'productname',
        ]);
        const unitTypesColumn = this.pickColumn(availableColumns, [
          'unitTypes',
          'unit_types',
          'unittypes',
        ]);
        const unitColumn = this.pickColumn(availableColumns, ['unit']);
        const createdByColumn = this.pickColumn(availableColumns, [
          'created_by',
          'createdBy',
          'createdby',
        ]);

        if (
          !brandColumn ||
          !productNameColumn ||
          !unitTypesColumn ||
          !unitColumn
        ) {
          throw new Error(
            'tblproducts columns are not aligned with expected product fields',
          );
        }

        const insertRecord: Record<string, unknown> = {
          [brandColumn]: payload.brandId,
          [productNameColumn]: payload.productName,
          [unitTypesColumn]: payload.unitTypes,
          [unitColumn]: payload.unit,
        };

        const productTypeColumn = this.pickColumn(availableColumns, ['productType', 'product_type']);
        if (productTypeColumn && payload.productType) {
          insertRecord[productTypeColumn] = String(payload.productType).trim();
        }

        const itemCodeColumn = this.pickColumn(availableColumns, ['itemCode', 'item_code', 'code']);
        if (itemCodeColumn && payload.itemCode) {
          insertRecord[itemCodeColumn] = String(payload.itemCode).trim();
        }

        if (createdByColumn) {
          insertRecord[createdByColumn] = payload.created_by;
        }

        const productInsertResult = await this.runInsert(
          client,
          'tblproducts',
          insertRecord,
        );

        if (productInsertResult.rowCount === 0) {
          throw new Error('Failed to create product');
        }

        const productId = productInsertResult.rows[0].id;
        const capacities = Array.isArray(prodData.capacities)
          ? prodData.capacities
          : [];

        for (const capacityItem of capacities) {
          await this.insertCapacityAndPriceHistory(
            client,
            productId,
            userId,
            capacityItem,
          );
        }

        return {
          id: productId,
          capacitiesInserted: capacities.length,
        };
      });

      return {
        success: true,
        id: result.id,
        capacitiesInserted: result.capacitiesInserted,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to connect to PostgreSQL',
      };
    }
  }

  async findAll() {
    try {
      const result = await this.databaseService.query<{
        id: number;
        product_name: string | null;
        brand_name: string | null;
        unit: string | null;
        unit_types: string | null;
        capacities: unknown;
      }>(
        `SELECT
           p.id,
           COALESCE(
             to_jsonb(p)->>'productName',
             to_jsonb(p)->>'product_name',
             to_jsonb(p)->>'productname'
           ) AS product_name,
           (
             SELECT COALESCE(
               to_jsonb(b)->>'name',
               to_jsonb(b)->>'brandName',
               to_jsonb(b)->>'brand_name'
             )
             FROM tblbrands b
             WHERE b.id::text = COALESCE(
               to_jsonb(p)->>'brandId',
               to_jsonb(p)->>'brand_id',
               to_jsonb(p)->>'brandid'
             )
             LIMIT 1
           ) AS brand_name,
           (
             SELECT COALESCE(
               to_jsonb(b)->>'type',
               to_jsonb(b)->>'brandType',
               to_jsonb(b)->>'brand_type',
               ''
             )
             FROM tblbrands b
             WHERE b.id::text = COALESCE(
               to_jsonb(p)->>'brandId',
               to_jsonb(p)->>'brand_id',
               to_jsonb(p)->>'brandid'
             )
             LIMIT 1
           ) AS brand_type,
           COALESCE(
             to_jsonb(p)->>'unit',
             ''
           ) AS unit,
           COALESCE(
             to_jsonb(p)->>'productType',
             to_jsonb(p)->>'product_type',
             ''
           ) AS product_type,
           COALESCE(
             to_jsonb(p)->>'itemCode',
             to_jsonb(p)->>'item_code',
             to_jsonb(p)->>'code',
             ''
           ) AS item_code,
           COALESCE(
             to_jsonb(p)->>'unitTypes',
             to_jsonb(p)->>'unit_types',
             to_jsonb(p)->>'unittypes',
             ''
           ) AS unit_types,
           COALESCE(
             (
               SELECT json_agg(
                 json_build_object(
                   'id', c.id,
                   'name', COALESCE(
                     to_jsonb(c)->>'capacity',
                     to_jsonb(c)->>'capacityValue',
                     to_jsonb(c)->>'capacity_value',
                     to_jsonb(c)->>'name'
                    ),
                    'cashPrice', COALESCE(
                      NULLIF(COALESCE(to_jsonb(c)->>'cashPrice', to_jsonb(c)->>'cash_price', ''), '')::numeric, 
                      0
                    ),
                    'ccPrice', COALESCE(
                      NULLIF(COALESCE(to_jsonb(c)->>'ccPrice', to_jsonb(c)->>'cc_price', ''), '')::numeric, 
                      0
                    ),
                   'sellPrice', COALESCE(
                     NULLIF(
                       COALESCE(
                         to_jsonb(c)->>'srp',
                         to_jsonb(c)->>'SRP',
                         ''
                       ),
                       ''
                     )::numeric,
                     0
                   ),
                   'unitPrice', COALESCE(
                     NULLIF(
                       COALESCE(
                         to_jsonb(c)->>'netPrice',
                         to_jsonb(c)->>'net_price',
                         ''
                       ),
                       ''
                     )::numeric,
                     0
                  ),
                  'indoorModel', COALESCE(
                    to_jsonb(c)->>'indoorModel',
                    to_jsonb(c)->>'indoor_model',
                    ''
                  ),
                  'outdoorModel', COALESCE(
                    to_jsonb(c)->>'outdoorModel',
                    to_jsonb(c)->>'outdoor_model',
                    ''
                   )
                 )
                 ORDER BY c.id
               )
               FROM tblcapacity c
               WHERE COALESCE(
                 to_jsonb(c)->>'prodId',
                 to_jsonb(c)->>'productId',
                 to_jsonb(c)->>'prod_id',
                 to_jsonb(c)->>'product_id'
               ) = p.id::text
             ),
             '[]'::json
           ) AS capacities
         FROM tblproducts p
         ORDER BY p.id DESC`,
      );

      return {
        success: true,
        items: result.rows.map((row) => ({
          id: row.id,
          name: row.product_name ?? `Product ${row.id}`,
          brandName: row.brand_name ?? undefined,
          productType: String(row.product_type ?? '').trim() || undefined,
          itemCode: String(row.item_code ?? '').trim() || undefined,
          unit: (row.unit ?? '').trim() || undefined,
          unitTypes: String(row.unit_types ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
          capacities: Array.isArray(row.capacities) ? row.capacities : [],
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load products',
        items: [],
      };
    }
  }

  async findOne(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid product id' };
    }

    const all = await this.findAll();
    const items = Array.isArray((all as { items?: unknown }).items)
      ? ((all as { items: Array<{ id: number }> }).items)
      : [];
    const product = items.find((item) => item.id === id);

    if (!product) {
      return { success: false, message: `Product ${id} not found` };
    }

    return { success: true, item: product };
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid product id' };
    }

    if (!updateProductDto || typeof updateProductDto !== 'object') {
      return { success: false, message: 'Invalid update payload' };
    }

    try {
      return await this.databaseService.withTransaction(async (client) => {
        const existingResult = await client.query<{
          id: number;
          brand_id: string | null;
          product_name: string | null;
        }>(
          `SELECT
             p.id,
             COALESCE(
               to_jsonb(p)->>'brandId',
               to_jsonb(p)->>'brand_id',
               to_jsonb(p)->>'brandid'
             ) AS brand_id,
             COALESCE(
               to_jsonb(p)->>'productName',
               to_jsonb(p)->>'product_name',
               to_jsonb(p)->>'productname'
             ) AS product_name
           FROM tblproducts p
           WHERE p.id = $1
           LIMIT 1`,
          [id],
        );

        if (existingResult.rowCount === 0) {
          return { success: false, message: `Product ${id} not found` };
        }

        const existing = existingResult.rows[0];

        const availableColumns = await this.getTableColumns(client, 'tblproducts');
        const brandColumn = this.pickColumn(availableColumns, [
          'brandId',
          'brand_id',
          'brandid',
        ]);
        const productNameColumn = this.pickColumn(availableColumns, [
          'productName',
          'product_name',
          'productname',
        ]);
        const unitTypesColumn = this.pickColumn(availableColumns, [
          'unitTypes',
          'unit_types',
          'unittypes',
        ]);
        const unitColumn = this.pickColumn(availableColumns, ['unit']);

        const updates: string[] = [];
        const values: unknown[] = [];

        const nextBrandId = Number(updateProductDto.brandId);
        if (brandColumn && Number.isFinite(nextBrandId) && nextBrandId > 0) {
          values.push(nextBrandId);
          updates.push(`"${brandColumn}" = $${values.length}`);
        }

        const nextProductName = String(updateProductDto.productName ?? '').trim();
        const hasProductNameUpdate = nextProductName.length > 0;
        if (productNameColumn && hasProductNameUpdate) {
          const duplicateBrandId =
            Number.isFinite(nextBrandId) && nextBrandId > 0
              ? String(nextBrandId)
              : String(existing.brand_id ?? '').trim();

          if (!duplicateBrandId) {
            return { success: false, message: 'Unable to resolve brand for product update' };
          }

          const duplicateCheck = await client.query<{ id: number }>(
            `SELECT id
             FROM tblproducts p
             WHERE LOWER(TRIM(COALESCE(
               to_jsonb(p)->>'productName',
               to_jsonb(p)->>'product_name',
               to_jsonb(p)->>'productname',
               ''
             ))) = LOWER(TRIM($1))
             AND COALESCE(
               to_jsonb(p)->>'brandId',
               to_jsonb(p)->>'brand_id',
               to_jsonb(p)->>'brandid'
             ) = $2::text
             AND p.id <> $3
             LIMIT 1`,
            [nextProductName, duplicateBrandId, id],
          );

          if (duplicateCheck.rowCount > 0) {
            return { success: false, message: 'Product already exists for this brand' };
          }

          values.push(nextProductName);
          updates.push(`"${productNameColumn}" = $${values.length}`);
        }

        if (unitColumn && typeof updateProductDto.unit === 'string') {
          const unitValue = updateProductDto.unit.trim().toUpperCase();
          if (unitValue) {
            values.push(unitValue);
            updates.push(`"${unitColumn}" = $${values.length}`);
          }
        }

        const productTypeColumn = this.pickColumn(availableColumns, ['productType', 'product_type']);
        if (productTypeColumn && typeof updateProductDto.productType === 'string') {
          const productTypeValue = updateProductDto.productType.trim();
          values.push(productTypeValue || null);
          updates.push(`"${productTypeColumn}" = $${values.length}`);
        }

        const itemCodeColumn = this.pickColumn(availableColumns, ['itemCode', 'item_code', 'code']);
        if (itemCodeColumn && typeof updateProductDto.itemCode === 'string') {
          values.push(updateProductDto.itemCode.trim() || null);
          updates.push(`"${itemCodeColumn}" = $${values.length}`);
        }

        if (unitTypesColumn && Array.isArray(updateProductDto.unitTypes)) {
          const unitTypes = updateProductDto.unitTypes
            .map((entry) => String(entry ?? '').trim())
            .filter((entry) => entry.length > 0);

          if (unitTypes.length > 0) {
            values.push(unitTypes.join(','));
            updates.push(`"${unitTypesColumn}" = $${values.length}`);
          }
        }

        if (updates.length === 0) {
          return { success: true, message: 'No product fields changed' };
        }

        values.push(id);
        await client.query(
          `UPDATE tblproducts p
           SET ${updates.join(', ')}
           WHERE p.id = $${values.length}`,
          values,
        );

        return { success: true, message: 'Product updated successfully' };
      });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update product',
      };
    }
  }

  remove(id: number) {
    return `This action removes a #${id} product`;
  }

  async bulkUpload(rows: Array<Record<string, unknown>>, userId: number) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, message: 'No rows provided' };
    }

    if (rows.length > 500) {
      return { success: false, message: 'Maximum 500 rows per upload' };
    }

    const results: Array<{ row: number; status: string; message: string }> = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    try {
      await this.databaseService.withTransaction(async (client) => {
        // Cache brand lookups within this transaction
        const brandCache = new Map<string, number>();

        const findOrCreateBrand = async (brandName: string): Promise<number> => {
          const normalized = brandName.trim();
          const cacheKey = normalized.toLowerCase();
          if (brandCache.has(cacheKey)) {
            return brandCache.get(cacheKey)!;
          }

          const columns = await this.getTableColumns(client, 'tblbrands');
          const nameColumn = this.pickColumn(columns, ['name', 'brandName', 'brand_name']);
          if (!nameColumn) {
            throw new Error('tblbrands name column not found');
          }

          const existing = await client.query<{ id: number }>(
            `SELECT b.id FROM tblbrands b
             WHERE LOWER(TRIM(COALESCE(to_jsonb(b)->>$1, ''))) = LOWER(TRIM($2))
             LIMIT 1`,
            [nameColumn, normalized],
          );

          if ((existing.rowCount ?? 0) > 0) {
            brandCache.set(cacheKey, existing.rows[0].id);
            return existing.rows[0].id;
          }

          const insertResult = await client.query<{ id: number }>(
            `INSERT INTO tblbrands ("${nameColumn}") VALUES ($1) RETURNING id`,
            [normalized],
          );

          const brandId = insertResult.rows[0].id;
          brandCache.set(cacheKey, brandId);
          return brandId;
        };

        // Cache product lookups
        const productCache = new Map<string, number>();

        const findOrCreateProduct = async (
          brandId: number,
          productName: string,
          unit: string,
          unitTypes: string,
        ): Promise<number> => {
          const cacheKey = `${brandId}::${productName.toLowerCase().trim()}`;
          if (productCache.has(cacheKey)) {
            return productCache.get(cacheKey)!;
          }

          const existing = await client.query<{ id: number }>(
            `SELECT p.id FROM tblproducts p
             WHERE LOWER(TRIM(COALESCE(
               to_jsonb(p)->>'productName',
               to_jsonb(p)->>'product_name',
               to_jsonb(p)->>'productname', ''
             ))) = LOWER(TRIM($1))
             AND COALESCE(
               to_jsonb(p)->>'brandId',
               to_jsonb(p)->>'brand_id',
               to_jsonb(p)->>'brandid'
             ) = $2::text
             LIMIT 1`,
            [productName.trim(), String(brandId)],
          );

          if ((existing.rowCount ?? 0) > 0) {
            productCache.set(cacheKey, existing.rows[0].id);
            return existing.rows[0].id;
          }

          const availableColumns = await this.getTableColumns(client, 'tblproducts');
          const brandColumn = this.pickColumn(availableColumns, ['brandId', 'brand_id', 'brandid']);
          const productNameColumn = this.pickColumn(availableColumns, ['productName', 'product_name', 'productname']);
          const unitTypesColumn = this.pickColumn(availableColumns, ['unitTypes', 'unit_types', 'unittypes']);
          const unitColumn = this.pickColumn(availableColumns, ['unit']);
          const createdByColumn = this.pickColumn(availableColumns, ['created_by', 'createdBy', 'createdby']);

          if (!brandColumn || !productNameColumn || !unitTypesColumn || !unitColumn) {
            throw new Error('tblproducts columns not aligned');
          }

          const insertRecord: Record<string, unknown> = {
            [brandColumn]: brandId,
            [productNameColumn]: productName.trim(),
            [unitTypesColumn]: unitTypes,
            [unitColumn]: unit.trim().toUpperCase() || 'SET',
          };
          if (createdByColumn) {
            insertRecord[createdByColumn] = userId;
          }

          const productResult = await this.runInsert(client, 'tblproducts', insertRecord);
          const productId = productResult.rows[0].id;
          productCache.set(cacheKey, productId);
          return productId;
        };

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 1;

          const brandName = String(row['brand'] ?? row['Brand'] ?? '').trim();
          const productName = String(row['product'] ?? row['Product'] ?? '').trim();
          const unit = String(row['unit'] ?? row['Unit'] ?? 'SET').trim();
          const unitTypes = String(row['unitTypes'] ?? row['UnitTypes'] ?? row['unitType'] ?? 'Indoor,Outdoor').trim();
          const capacity = String(row['capacity'] ?? row['Capacity'] ?? '').trim();
          const srp = Number(row['srp'] ?? row['SRP'] ?? 0) || 0;
          const netPrice = Number(row['netPrice'] ?? row['NetPrice'] ?? row['net_price'] ?? 0) || 0;
          const cashPrice = Number(row['cashPrice'] ?? row['CashPrice'] ?? row['cash_price'] ?? 0) || 0;
          const ccPrice = Number(row['ccPrice'] ?? row['CCPrice'] ?? row['cc_price'] ?? 0) || 0;
          const unitPrice = Number(row['unitPrice'] ?? row['UnitPrice'] ?? row['unit_price'] ?? 0) || 0;
          const indoorModel = String(row['indoorModel'] ?? row['IndoorModel'] ?? row['indoor_model'] ?? '').trim();
          const outdoorModel = String(row['outdoorModel'] ?? row['OutdoorModel'] ?? row['outdoor_model'] ?? '').trim();

          if (!brandName) {
            results.push({ row: rowNum, status: 'failed', message: 'Brand is required' });
            failed++;
            continue;
          }

          if (!productName) {
            results.push({ row: rowNum, status: 'failed', message: 'Product is required' });
            failed++;
            continue;
          }

          if (!capacity) {
            results.push({ row: rowNum, status: 'failed', message: 'Capacity is required' });
            failed++;
            continue;
          }

          try {
            const brandId = await findOrCreateBrand(brandName);
            const productId = await findOrCreateProduct(brandId, productName, unit, unitTypes);

            // Check if capacity already exists for this product
            const capacityColumns = await this.getTableColumns(client, 'tblcapacity');
            const capProductIdCol = this.pickColumn(capacityColumns, ['prodId', 'productId', 'prod_id', 'product_id']);
            const capValueCol = this.pickColumn(capacityColumns, ['capacity', 'capacityValue']);

            if (!capProductIdCol || !capValueCol) {
              results.push({ row: rowNum, status: 'failed', message: 'Capacity table misconfigured' });
              failed++;
              continue;
            }

            const existingCap = await client.query<{ id: number }>(
              `SELECT id FROM tblcapacity
               WHERE COALESCE(to_jsonb(tblcapacity)->>$1, '') = $2::text
               AND LOWER(TRIM(COALESCE(to_jsonb(tblcapacity)->>$3, ''))) = LOWER(TRIM($4))
               LIMIT 1`,
              [capProductIdCol, String(productId), capValueCol, capacity],
            );

            if ((existingCap.rowCount ?? 0) > 0) {
              results.push({ row: rowNum, status: 'skipped', message: `Capacity "${capacity}" already exists for this product` });
              skipped++;
              continue;
            }

            await this.insertCapacityAndPriceHistory(client, productId, userId, {
              capacity,
              indoorModel,
              outdoorModel,
              srp,
              netPrice,
              cashPrice,
              ccPrice,
              unitPrice,
            });

            results.push({ row: rowNum, status: 'created', message: `${brandName} > ${productName} > ${capacity}` });
            created++;
          } catch (rowError) {
            results.push({
              row: rowNum,
              status: 'failed',
              message: rowError instanceof Error ? rowError.message : 'Unknown error',
            });
            failed++;
          }
        }
      });

      return {
        success: true,
        message: `Bulk upload complete: ${created} created, ${skipped} skipped, ${failed} failed`,
        summary: { created, skipped, failed, total: rows.length },
        results,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Bulk upload failed',
        summary: { created: 0, skipped: 0, failed: rows.length, total: rows.length },
        results,
      };
    }
  }
}
