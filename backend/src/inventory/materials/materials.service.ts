/**
 * =====================================================
 * MATERIALS SERVICE
 * =====================================================
 * Purpose: Business logic layer for material inventory management
 * 
 * This service handles:
 * 1. CRUD operations (Create, Read, Update, Delete)
 * 2. Stock management
 * 3. Price history tracking
 * 4. Brand filtering (only MAT type brands)
 * 
 * Database Table: tblmaterials
 * =====================================================
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { Material } from './entities/material.entity';

export type QueryClient = {
  query: (text: string, params?: unknown[]) => Promise<any>;
};

@Injectable()
export class MaterialsService {
  /** Cache for brand names used during bulk upload */
  private _allBrandNamesCache: string[] | null = null;

  /**
   * Constructor - Inject DatabaseService for database operations
   * DatabaseService provides the PostgreSQL connection pool
   */
  constructor(private readonly db: DatabaseService) {}

  /**
   * =====================================================
   * BULK UPLOAD MATERIALS
   * =====================================================
   * Processes an array of rows from CSV/Excel upload.
   * For each row:
   *   - Finds or creates the product type (by name)
   *   - Finds or creates the brand (by name, under that product type, type='MAT')
   *   - Creates the material (skips if material_name already exists for that brand)
   *
   * @param rows - Array of row objects from the frontend
   * @param userId - User performing the upload
   * @returns Summary with created/skipped/failed counts and per-row results
   * =====================================================
   */
  async bulkUpload(
    rows: any[],
    userId: number,
  ): Promise<{ success: boolean; summary: { total: number; created: number; skipped: number; failed: number }; results: any[] }> {
    const results: any[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    // Reset brand names cache for this upload session
    this._allBrandNamesCache = null;

    // Cache for product types and brands to avoid repeated DB lookups
    const productTypeCache = new Map<string, number>(); // name (lowercase) -> id
    const brandCache = new Map<string, number>(); // "productTypeId|brandName" (lowercase) -> id

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      try {
        // Validate required field
        const materialName = (row.material_name ?? '').toString().trim();
        if (!materialName) {
          results.push({ row: rowNum, status: 'failed', message: 'material_name is required' });
          failed++;
          continue;
        }

        const productTypeName = (row.product_type ?? '').toString().trim();
        let brandName = (row.brand ?? '').toString().trim();

        // If brand is empty, try to extract it from the material name
        // by matching words or consecutive word combinations against existing brands
        if (!brandName) {
          const words = materialName.split(/\s+/);
          // Load all existing brand names once (cached after first use)
          if (!this._allBrandNamesCache) {
            const allBrandsResult = await this.db.query(
              `SELECT DISTINCT "brandName" FROM tblbrands WHERE type = 'MAT' AND "brandName" IS NOT NULL`,
            );
            this._allBrandNamesCache = allBrandsResult.rows.map((r: any) => r.brandName?.trim()).filter(Boolean);
          }
          // Check multi-word combinations first (longest match wins, up to 4 words)
          for (let len = Math.min(words.length, 4); len >= 1; len--) {
            if (brandName) break;
            for (let start = 0; start <= words.length - len; start++) {
              const phrase = words.slice(start, start + len).join(' ');
              const match = this._allBrandNamesCache!.find(
                (b: string) => b.toLowerCase() === phrase.toLowerCase()
              );
              if (match) {
                brandName = match;
                break;
              }
            }
          }
        }

        if (!brandName) {
          // Fallback: use "Uncategorized <product_type>" when brand can't be inferred
          const ptLabel = productTypeName || 'General';
          brandName = `Uncategorized ${ptLabel}`;
        }

        // Step 1: Find or create product type
        let productTypeId: number | null = null;
        if (productTypeName) {
          const ptKey = productTypeName.toLowerCase();
          if (productTypeCache.has(ptKey)) {
            productTypeId = productTypeCache.get(ptKey)!;
          } else {
            // Try to find existing
            const ptResult = await this.db.query(
              `SELECT id FROM tblproducttypes WHERE LOWER(name) = LOWER($1) LIMIT 1`,
              [productTypeName],
            );
            if (ptResult.rows.length > 0) {
              productTypeId = ptResult.rows[0].id;
            } else {
              // Create new product type
              const insertPt = await this.db.query(
                `INSERT INTO tblproducttypes (name, prefix) VALUES ($1, $2) RETURNING id`,
                [productTypeName, productTypeName.substring(0, 3).toUpperCase()],
              );
              productTypeId = insertPt.rows[0].id;
            }
            productTypeCache.set(ptKey, productTypeId!);
          }
        }

        // Step 2: Find or create brand (type='MAT', under product type)
        let brandId: number | null = null;
        const brandKey = `${productTypeId ?? 'null'}|${brandName.toLowerCase()}`;
        if (brandCache.has(brandKey)) {
          brandId = brandCache.get(brandKey)!;
        } else {
          // Try to find existing brand with same name and product_type_id
          let brandQuery = `SELECT id FROM tblbrands WHERE LOWER("brandName") = LOWER($1) AND type = 'MAT'`;
          const brandParams: any[] = [brandName];
          if (productTypeId) {
            brandQuery += ` AND product_type_id = $2`;
            brandParams.push(productTypeId);
          } else {
            brandQuery += ` AND product_type_id IS NULL`;
          }
          brandQuery += ` LIMIT 1`;

          const brandResult = await this.db.query(brandQuery, brandParams);
          if (brandResult.rows.length > 0) {
            brandId = brandResult.rows[0].id;
          } else {
            // Create new brand
            const insertBrand = await this.db.query(
              `INSERT INTO tblbrands ("brandName", prefix, type, product_type_id) VALUES ($1, $2, 'MAT', $3) RETURNING id`,
              [brandName, brandName.substring(0, 3).toUpperCase(), productTypeId],
            );
            brandId = insertBrand.rows[0].id;
          }
          brandCache.set(brandKey, brandId!);
        }

        // Step 3: Check if material already exists for this brand
        const duplicateCheck = await this.db.query(
          `SELECT id FROM tblmaterials WHERE LOWER(material_name) = LOWER($1) AND brand_id = $2 AND deleted_at IS NULL`,
          [materialName, brandId],
        );

        if (duplicateCheck.rows.length > 0) {
          results.push({ row: rowNum, status: 'skipped', message: `Material "${materialName}" already exists for this brand`, brand: brandName });
          skipped++;
          continue;
        }

        // Step 4: Create the material
        const unit = (row.unit ?? 'pcs').toString().trim() || 'pcs';
        const unitPrice = Number(row.unit_price) || 0;
        const sellPrice = Number(row.sell_price) || 0;
        const onHandStock = Number(row.on_hand_stock) || 0;
        const reorderLevel = Number(row.reorder_level) || 0;
        const materialCode = (row.material_code ?? '').toString().trim() || null;

        await this.db.query(
          `INSERT INTO tblmaterials (brand_id, material_name, material_code, unit, unit_price, sell_price, on_hand_stock, reorder_level, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [brandId, materialName, materialCode, unit, unitPrice, sellPrice, onHandStock, reorderLevel, userId],
        );

        results.push({ row: rowNum, status: 'created', message: `Created "${materialName}"`, brand: brandName });
        created++;
      } catch (err: any) {
        results.push({ row: rowNum, status: 'failed', message: err?.message || 'Unknown error' });
        failed++;
      }
    }

    return {
      success: true,
      summary: { total: rows.length, created, skipped, failed },
      results,
    };
  }

  /**
   * =====================================================
   * MIGRATE STOCK
   * =====================================================
   * Bulk update stock levels for existing materials.
   * Records IN movements for full audit trail.
   * 
   * Steps:
   * 1. For each row: lookup material by code
   * 2. Record IN stock movement
   * 3. Update material on_hand_stock
   * 4. Return results with success/failure count
   * =====================================================
   */
  async migrateStock(
    rows: any[],
    userId: number,
  ): Promise<{ success: boolean; summary: { total: number; updated: number; skipped: number; failed: number }; results: any[] }> {
    const results: any[] = [];
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      try {
        // Validate required fields
        const materialCode = (row.material_code ?? '').toString().trim();
        const quantity = Number(row.quantity ?? 0);

        if (!materialCode) {
          results.push({ row: rowNum, status: 'failed', message: 'material_code is required' });
          failed++;
          continue;
        }

        // Skip rows with 0 quantity to make the API faster
        if (quantity === 0) {
          results.push({ row: rowNum, status: 'skipped', message: 'Skipped: quantity is 0' });
          skipped++;
          continue;
        }

        if (quantity < 0) {
          results.push({ row: rowNum, status: 'failed', message: 'quantity must be greater than 0' });
          failed++;
          continue;
        }

        // Find material by code
        const materialResult = await this.db.query(
          `SELECT id, material_name, on_hand_stock FROM tblmaterials 
           WHERE material_code = $1 AND deleted_at IS NULL LIMIT 1`,
          [materialCode],
        );

        if (materialResult.rows.length === 0) {
          results.push({ row: rowNum, status: 'failed', message: `Material with code "${materialCode}" not found` });
          failed++;
          continue;
        }

        const material = materialResult.rows[0];
        const materialId = material.id;
        const previousStock = Number(material.on_hand_stock || 0);
        const newStock = quantity;  // Set to the migrated quantity, not adding to existing

        // Use transaction to ensure atomicity
        await this.db.query('BEGIN');

        try {
          // Record IN movement for audit trail
          await this.db.query(
            `INSERT INTO tblmaterial_stock_movement 
             (material_id, movement_type, qty, source_type, source_id, source_line_key, status_snapshot, remarks, created_by)
             VALUES ($1, 'IN', $2, 'MANUAL', 0, $3, 'migration', $4, $5)`,
            [
              materialId,
              quantity,
              `stock_migration_${materialId}_${Date.now()}`,
              `Stock migration: Added ${quantity} units (${previousStock} → ${newStock})`,
              userId,
            ],
          );

          // Update on_hand_stock in tblmaterials
          await this.db.query(
            `UPDATE tblmaterials SET on_hand_stock = $1 WHERE id = $2`,
            [newStock, materialId],
          );

          // Update or create stock balance
          const balanceCheckResult = await this.db.query(
            `SELECT id FROM tblmaterial_stock_balance WHERE material_id = $1`,
            [materialId],
          );

          if (balanceCheckResult.rows.length > 0) {
            // Update existing balance
            await this.db.query(
              `UPDATE tblmaterial_stock_balance SET on_hand = $1 WHERE material_id = $2`,
              [newStock, materialId],
            );
          } else {
            // Create new balance record
            await this.db.query(
              `INSERT INTO tblmaterial_stock_balance (material_id, on_hand, reserved) VALUES ($1, $2, 0)`,
              [materialId, newStock],
            );
          }

          await this.db.query('COMMIT');

          results.push({
            row: rowNum,
            material_code: materialCode,
            status: 'updated',
            message: `Stock updated from ${previousStock} to ${newStock}`,
          });
          updated++;
        } catch (innerErr: any) {
          await this.db.query('ROLLBACK');
          throw innerErr;
        }
      } catch (err: any) {
        results.push({ row: rowNum, status: 'failed', message: err?.message || 'Unknown error' });
        failed++;
      }
    }

    return {
      success: true,
      summary: { total: rows.length, updated, skipped, failed },
      results,
    };
  }

  /**
   * =====================================================
   * CREATE MATERIAL
   * =====================================================
   * Creates a new material in the inventory
   * 
   * Steps:
   * 1. Validate brand_id (must be MAT type if provided)
   * 2. Check for duplicate material_name
   * 3. Insert into tblmaterials
   * 4. Return created material with brand info
   * =====================================================
   */
  async create(createMaterialDto: CreateMaterialDto, userId: number): Promise<Material> {
    // Step 1: Validate brand if provided
    if (createMaterialDto.brand_id) {
      const brandCheck = await this.db.query(
        `SELECT id, type FROM tblbrands WHERE id = $1`,
        [createMaterialDto.brand_id]
      );

      if (brandCheck.rows.length === 0) {
        throw new NotFoundException(`Brand with ID ${createMaterialDto.brand_id} not found`);
      }

      // Ensure brand is of type 'MAT' (Material)
      if (brandCheck.rows[0].type !== 'MAT') {
        throw new BadRequestException('Selected brand is not a material brand. Please select a brand with type MAT.');
      }
    }

    // Step 2: Check for duplicate material name + brand combination
    if (createMaterialDto.brand_id) {
      const duplicateCheck = await this.db.query(
        `SELECT id FROM tblmaterials WHERE material_name = $1 AND brand_id = $2 AND deleted_at IS NULL`,
        [createMaterialDto.material_name, createMaterialDto.brand_id]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new BadRequestException(`Material '${createMaterialDto.material_name}' already exists for this brand`);
      }
    }

    // Step 3: Insert new material
    // Build columns/values dynamically to handle optional product_type_id column
    const columns: string[] = [
      'brand_id', 'material_name', 'material_code', 'description', 'unit',
      'unit_price', 'sell_price', 'on_hand_stock', 'reorder_level', 'created_by'
    ];
    const values: any[] = [
      createMaterialDto.brand_id || null,
      createMaterialDto.material_name,
      createMaterialDto.material_code || null,
      createMaterialDto.description || null,
      createMaterialDto.unit || 'PCS',
      createMaterialDto.unit_price || 0,
      createMaterialDto.sell_price || 0,
      createMaterialDto.on_hand_stock || 0,
      createMaterialDto.reorder_level || 0,
      userId
    ];

    // Only include product_type_id if the column exists in the table
    if (createMaterialDto.product_type_id) {
      const colCheck = await this.db.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'tblmaterials' AND column_name = 'product_type_id'  LIMIT 1`
      );
      if (colCheck.rowCount > 0) {
        columns.splice(1, 0, 'product_type_id'); // insert after brand_id
        values.splice(1, 0, createMaterialDto.product_type_id);
      }
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const insertQuery = `
      INSERT INTO tblmaterials (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.db.query(insertQuery, values);
    const material = result.rows[0];

    // Step 4: Fetch with brand info and return
    return this.findOne(material.id);
  }

  /**
   * =====================================================
   * FIND ALL MATERIALS
   * =====================================================
   * Retrieves all materials with optional filtering
   * 
   * Features:
   * - Joins with tblbrands to get brand name
   * - Filters out soft-deleted materials
   * - Optional search by material name
   * - Optional filter by brand
   * - Ordered by material name
   * =====================================================
   */
  async findAll(search?: string, brandId?: number, productTypeId?: number): Promise<Material[]> {
    let query = `
      SELECT 
        m.*,
        c."brandName" as brand_name
      FROM tblmaterials m
      LEFT JOIN tblproducttypes b ON m."product_type_id" = b."id"
      LEFT JOIN tblbrands c ON m.brand_id = c.id
      WHERE m.deleted_at IS NULL
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Add search filter if provided
    if (search) {
      query += ` AND m.material_name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Add brand filter if provided
    if (brandId !== undefined && brandId !== null) {
      query += ` AND m.brand_id = $${paramIndex}`;
      params.push(brandId);
      paramIndex++;
    }

    // Add product type filter — get all materials whose brand belongs to this product type
    if (productTypeId !== undefined && productTypeId !== null) {
      query += ` AND b.id = $${paramIndex}`;
      params.push(productTypeId);
      paramIndex++;
    }

    query += ` ORDER BY m.material_name ASC`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * =====================================================
   * FIND ONE MATERIAL
   * =====================================================
   * Retrieves a single material by ID with brand info
   * 
   * Throws NotFoundException if material doesn't exist or is deleted
   * =====================================================
   */
  async findOne(id: number, options?: { client?: QueryClient }): Promise<Material> {
    const executor = options?.client ?? this.db;

    const query = `
      SELECT 
        m.*,
        b."brandName" as brand_name
      FROM tblmaterials m
      LEFT JOIN tblbrands b ON m.brand_id = b.id
      WHERE m.id = $1 AND m.deleted_at IS NULL
    `;

    const result = await executor.query(query, [id]);

    if (result.rows.length === 0) {
      throw new NotFoundException(`Material with ID ${id} not found`);
    }

    return result.rows[0];
  }

  /**
   * =====================================================
   * UPDATE MATERIAL
   * =====================================================
   * Updates an existing material
   * 
   * Steps:
   * 1. Check if material exists
   * 2. Validate brand if being changed
   * 3. Check for duplicate name if being changed
   * 4. Update material
   * 5. Track price history if prices changed
   * =====================================================
   */
  async update(id: number, updateMaterialDto: UpdateMaterialDto, userId: number): Promise<Material> {
    // Step 1: Check if material exists
    await this.findOne(id);

    // Step 2: Validate brand if provided
    if (updateMaterialDto.brand_id) {
      const brandCheck = await this.db.query(
        `SELECT id, type FROM tblbrands WHERE id = $1`,
        [updateMaterialDto.brand_id]
      );

      if (brandCheck.rows.length === 0) {
        throw new NotFoundException(`Brand with ID ${updateMaterialDto.brand_id} not found`);
      }

      if (brandCheck.rows[0].type !== 'MAT') {
        throw new BadRequestException('Selected brand is not a material brand');
      }
    }

    // Step 3: Check for duplicate name if being changed
    if (updateMaterialDto.material_name) {
      const duplicateCheck = await this.db.query(
        `SELECT id FROM tblmaterials 
         WHERE material_name = $1 AND id != $2 AND deleted_at IS NULL`,
        [updateMaterialDto.material_name, id]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new BadRequestException(`Material with name '${updateMaterialDto.material_name}' already exists`);
      }
    }

    // Step 3b: Check for duplicate material_code if being changed
    if (updateMaterialDto.material_code && updateMaterialDto.material_code.trim()) {
      const codeCheck = await this.db.query(
        `SELECT id FROM tblmaterials 
         WHERE material_code = $1 AND id != $2 AND deleted_at IS NULL`,
        [updateMaterialDto.material_code.trim(), id]
      );

      if (codeCheck.rows.length > 0) {
        throw new BadRequestException(`Material code '${updateMaterialDto.material_code}' is already in use`);
      }
    }

    // Step 4: Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Helper function to add field to update
    const addField = (field: string, value: any) => {
      if (value !== undefined) {
        updateFields.push(`${field} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    };

    addField('brand_id', updateMaterialDto.brand_id);
    addField('material_name', updateMaterialDto.material_name);
    addField('material_code', updateMaterialDto.material_code === '' ? null : updateMaterialDto.material_code);
    addField('description', updateMaterialDto.description);
    addField('unit', updateMaterialDto.unit);
    addField('unit_price', updateMaterialDto.unit_price);
    addField('sell_price', updateMaterialDto.sell_price);
    addField('on_hand_stock', updateMaterialDto.on_hand_stock);
    addField('reorder_level', updateMaterialDto.reorder_level);
    
    // Always update these fields
    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`updated_by = $${paramIndex}`);
    values.push(userId);
    paramIndex++;

    // Add ID for WHERE clause
    values.push(id);

    const updateQuery = `
      UPDATE tblmaterials
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      await this.db.query(updateQuery, values);
    } catch (err: any) {
      // Handle unique constraint violations with user-friendly messages
      if (err?.code === '23505') {
        if (err?.constraint?.includes('material_code')) {
          throw new BadRequestException('Material code is already in use by another material');
        }
        if (err?.constraint?.includes('material_name')) {
          throw new BadRequestException('Material name is already in use by another material');
        }
        throw new BadRequestException('A unique constraint was violated');
      }
      throw err;
    }

    // Step 5: Track price history if prices changed
    if (updateMaterialDto.unit_price !== undefined || updateMaterialDto.sell_price !== undefined) {
      const material = await this.findOne(id);
      await this.trackPriceHistory(id, material.unit_price, material.sell_price, userId);
    }

    return this.findOne(id);
  }

  /**
   * =====================================================
   * DELETE MATERIAL (Soft Delete)
   * =====================================================
   * Soft deletes a material (sets deleted_at timestamp)
   * 
   * Soft delete means the record stays in database but is marked as deleted
   * This preserves historical data and relationships
   * =====================================================
   */
  async remove(id: number, userId: number): Promise<void> {
    // Check if material exists and get its brand info for resequencing
    const material = await this.findOne(id);

    // Soft delete by setting deleted_at
    const deleteQuery = `
      UPDATE tblmaterials
      SET deleted_at = NOW(), deleted_by = $1
      WHERE id = $2
    `;

    await this.db.query(deleteQuery, [userId, id]);

    // Auto-resequence material codes for the same product type
    if (material.brand_id) {
      try {
        const brandResult = await this.db.query<{ product_type_id: number | null }>(
          `SELECT product_type_id FROM tblbrands WHERE id = $1`,
          [material.brand_id],
        );
        const productTypeId = brandResult.rows[0]?.product_type_id;

        if (productTypeId) {
          // Get the prefix for this product type
          const ptResult = await this.db.query<{ prefix: string }>(
            `SELECT COALESCE(
               COALESCE(to_jsonb(t)->>'prefix', to_jsonb(t)->>'typePrefix', to_jsonb(t)->>'type_prefix'),
               ''
             ) AS prefix
             FROM tblproducttypes t WHERE t.id = $1 LIMIT 1`,
            [productTypeId],
          );
          const prefix = String(ptResult.rows[0]?.prefix ?? '').trim();

          if (prefix) {
            // Resequence all remaining materials under this product type
            const materials = await this.db.query<{ id: number }>(
              `SELECT m.id
               FROM tblmaterials m
               JOIN tblbrands b ON m.brand_id = b.id
               WHERE b.product_type_id = $1 AND m.deleted_at IS NULL
               ORDER BY m.material_name ASC, m.id ASC`,
              [productTypeId],
            );

            for (let i = 0; i < materials.rows.length; i++) {
              const newCode = `${prefix}${String(i + 1).padStart(5, '0')}`;
              await this.db.query(
                `UPDATE tblmaterials SET material_code = $1 WHERE id = $2`,
                [newCode, materials.rows[i].id],
              );
            }
          }
        }
      } catch {
        // Non-fatal — don't fail the delete if resequencing fails
      }
    }
  }

  /**
   * =====================================================
   * GET MATERIAL TREE
   * =====================================================
   * Retrieves hierarchical tree structure:
   * Product Types → MAT Brands
   * 
   * Returns all product types as parent nodes with their
   * associated MAT-type brands as children. Brands without
   * a product_type_id are grouped under "Uncategorized".
   * =====================================================
   */
  async getTree(): Promise<{ success: boolean; tree: any[] }> {
    // Query 1: Product Types with their MAT brands
    const treeQuery = `
      SELECT
        pt.id AS product_type_id,
        pt.name AS product_type_name,
        b.id AS brand_id,
        b."brandName" AS brand_name,
        b.prefix AS brand_prefix
      FROM tblproducttypes pt
      LEFT JOIN tblbrands b ON b.product_type_id = pt.id AND b.type = 'MAT'
      ORDER BY pt.name ASC, b."brandName" ASC
    `;

    // Query 2: Uncategorized brands (no product_type_id)
    const uncategorizedQuery = `
      SELECT
        b.id AS brand_id,
        b."brandName" AS brand_name,
        b.prefix AS brand_prefix
      FROM tblbrands b
      WHERE b.type = 'MAT' AND b.product_type_id IS NULL
      ORDER BY b."brandName" ASC
    `;

    // Query 3: Material count per product type (via brand's product_type_id)
    const materialCountQuery = `
      SELECT m.product_type_id, COUNT(m.id)::int AS material_count
      FROM tblmaterials m
      WHERE m.deleted_at IS NULL AND m.product_type_id IS NOT NULL
      GROUP BY m.product_type_id;
    `;

    // Query 4: Material count for uncategorized (brands without product_type_id)
    const uncategorizedCountQuery = `
      SELECT COUNT(m.id)::int AS material_count
      FROM tblmaterials m
      WHERE m.deleted_at IS NULL AND m.product_type_id IS NULL;
    `;

    const [treeResult, uncategorizedResult, countResult, uncatCountResult] = await Promise.all([
      this.db.query(treeQuery),
      this.db.query(uncategorizedQuery),
      this.db.query(materialCountQuery),
      this.db.query(uncategorizedCountQuery),
    ]);

    // Build a map of product_type_id → material count
    const countMap = new Map<number, number>();
    for (const row of countResult.rows) {
      countMap.set(row.product_type_id, row.material_count);
    }

    // Build product type nodes from the joined query
    const productTypeMap = new Map<number, any>();

    for (const row of treeResult.rows) {
      if (!productTypeMap.has(row.product_type_id)) {
        productTypeMap.set(row.product_type_id, {
          id: row.product_type_id,
          name: row.product_type_name,
          type: 'product-type',
          materialCount: countMap.get(row.product_type_id) ?? 0,
          children: [],
        });
      }

      // Only add brand if it exists (LEFT JOIN may produce null brand_id)
      if (row.brand_id) {
        productTypeMap.get(row.product_type_id).children.push({
          id: row.brand_id,
          name: row.brand_name,
          type: 'brand',
          prefix: row.brand_prefix || '',
        });
      }
    }

    // Convert map to sorted array (already sorted by SQL ORDER BY)
    const tree: any[] = Array.from(productTypeMap.values());

    // Add "Uncategorized" node if there are brands without product_type_id
    if (uncategorizedResult.rows.length > 0) {
      const uncatCount = Number(uncatCountResult.rows[0]?.material_count ?? 0);
      const uncategorizedNode = {
        id: null,
        name: 'Uncategorized',
        type: 'product-type',
        materialCount: uncatCount,
        children: uncategorizedResult.rows.map((row) => ({
          id: row.brand_id,
          name: row.brand_name,
          type: 'brand',
          prefix: row.brand_prefix || '',
        })),
      };
      tree.push(uncategorizedNode);
    }

    return { success: true, tree };
  }

  /**
   * =====================================================
   * GET MATERIAL BRANDS
   * =====================================================
   * Retrieves all brands with type='MAT'
   * Used for dropdown/select options in the UI
   * =====================================================
   */
  async getMaterialBrands(): Promise<any[]> {
    const query = `
      SELECT id, "brandName", prefix
      FROM tblbrands
      WHERE type = 'MAT'
      ORDER BY "brandName" ASC
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  async getNextMaterialCode(brandId: number): Promise<{ material_code: string; next_sequence: number }> {
    const brandResult = await this.db.query(
      `SELECT prefix FROM tblbrands WHERE id = $1`,
      [brandId]
    );

    if (brandResult.rows.length === 0) {
      throw new NotFoundException(`Brand with ID ${brandId} not found`);
    }

    const prefix = String(brandResult.rows[0].prefix ?? '').trim();
    if (!prefix) {
      throw new BadRequestException('Selected brand does not have a prefix configured');
    }

    return this.getNextSequenceForPrefix(prefix);
  }

  /**
   * Get the next material code sequence for a given prefix.
   * Scans existing material_code values in tblmaterials to find the max sequence.
   */
  async getNextSequenceForPrefix(prefix: string): Promise<{ material_code: string; next_sequence: number }> {
    if (!prefix || !prefix.trim()) {
      throw new BadRequestException('Prefix is required');
    }

    const trimmedPrefix = prefix.trim();

    const codeResult = await this.db.query(
      `SELECT material_code FROM tblmaterials WHERE material_code LIKE $1 AND deleted_at IS NULL`,
      [`${trimmedPrefix}%`]
    );

    const maxSequence = codeResult.rows.reduce((max: number, row: any) => {
      const code = String(row.material_code ?? '');
      if (!code.startsWith(trimmedPrefix)) {
        return max;
      }
      const digits = code.substring(trimmedPrefix.length).match(/^0*(\d+)$/);
      if (!digits) {
        return max;
      }
      const sequence = Number(digits[1]);
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0);

    const nextSequence = maxSequence + 1;
    const materialCode = `${trimmedPrefix}${String(nextSequence).padStart(5, '0')}`;

    return { material_code: materialCode, next_sequence: nextSequence };
  }

  /**
   * =====================================================
   * SEARCH MATERIALS (Smart Search)
   * =====================================================
    * Searches materials by material code only.
   * Used for the smart search dropdown in the sales order form.
   *
   * @param q - Search query string (min 1 char)
   * @param limit - Max results to return (max 50, default 50)
   * @returns Array of MaterialSearchResult
   * =====================================================
   */
  async searchMaterials(q: string, limit: number = 50): Promise<any[]> {
    const searchTerm = `%${q}%`;
    const cappedLimit = Math.min(Math.max(limit, 1), 50);

    const query = `
      SELECT 
        m.id,
        m.material_name,
        m.material_code,
        b.type AS product_type,
        b."brandName" AS brand_name,
        m.unit,
        m.unit_price,
        m.sell_price,
        m.on_hand_stock,
        m.reorder_level
      FROM tblmaterials m
      LEFT JOIN tblbrands b ON m.brand_id = b.id
      WHERE m.deleted_at IS NULL
        AND m.material_code ILIKE $1
      ORDER BY m.material_code ASC
      LIMIT $2
    `;

    const result = await this.db.query(query, [searchTerm, cappedLimit]);
    return result.rows;
  }

  /**
   * =====================================================
   * GET MATERIAL HISTORY
   * =====================================================
   * Retrieves price history and stock movements for a material
   * 
   * Returns:
   * - Price history from tblmaterial_price_history (latest 100)
   * - Stock movements from tblmaterial_stock_movement (latest 100)
   * Both ordered by created_at DESC
   * =====================================================
   */
  async getHistory(id: number): Promise<{
    success: boolean;
    priceHistory: any[];
    stockMovements: any[];
  }> {
    // Verify material exists
    await this.findOne(id);

    const priceHistoryQuery = `
      SELECT id, unit_price, sell_price, created_by, created_at
      FROM tblmaterial_price_history
      WHERE material_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const stockMovementsQuery = `
      SELECT id, movement_type, qty, source_type, source_id, source_line_key, remarks, created_by, created_at
      FROM tblmaterial_stock_movement
      WHERE material_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const [priceResult, movementResult] = await Promise.all([
      this.db.query(priceHistoryQuery, [id]),
      this.db.query(stockMovementsQuery, [id]),
    ]);

    return {
      success: true,
      priceHistory: priceResult.rows.map((row) => ({
        id: row.id,
        unit_price: Number(row.unit_price),
        sell_price: Number(row.sell_price),
        created_by: row.created_by ?? null,
        created_at: row.created_at,
      })),
      stockMovements: movementResult.rows.map((row) => ({
        id: row.id,
        movement_type: row.movement_type,
        qty: Number(row.qty),
        source_type: row.source_type,
        source_id: Number(row.source_id),
        source_line_key: row.source_line_key,
        remarks: row.remarks ?? null,
        created_by: row.created_by ?? null,
        created_at: row.created_at,
      })),
    };
  }

  /**
   * =====================================================
   * GET LOW STOCK MATERIALS
   * =====================================================
   * Retrieves materials where on_hand_stock <= reorder_level
   * Used for inventory alerts and reorder notifications
   * =====================================================
   */
  async getLowStockMaterials(): Promise<Material[]> {
    const query = `
      SELECT 
        m.*,
        b."brandName" as brand_name
      FROM tblmaterials m
      LEFT JOIN tblbrands b ON m.brand_id = b.id
      WHERE m.deleted_at IS NULL 
        AND m.on_hand_stock <= m.reorder_level
      ORDER BY m.on_hand_stock ASC
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * =====================================================
   * TRACK PRICE HISTORY
   * =====================================================
   * Records price changes in tblmaterial_price_history
   * Useful for:
   * - Price trend analysis
   * - Profit margin calculations
   * - Audit trail
   * =====================================================
   */
  private async trackPriceHistory(
    materialId: number,
    unitPrice: number,
    sellPrice: number,
    userId: number
  ): Promise<void> {
    const query = `
      INSERT INTO tblmaterial_price_history (
        material_id, unit_price, sell_price, created_by
      )
      VALUES ($1, $2, $3, $4)
    `;

    await this.db.query(query, [materialId, unitPrice, sellPrice, userId]);
  }

  /**
   * =====================================================
   * UPDATE STOCK
   * =====================================================
   * Updates material stock quantity
   * Used when:
   * - Purchase Order is approved (increase stock)
   * - Sales Order is completed (decrease stock)
   * 
   * @param materialId - Material ID
   * @param quantity - Quantity to add (positive) or subtract (negative)
   * @param userId - User making the change
   * =====================================================
   */
  async updateStock(
    materialId: number,
    quantity: number,
    userId: number | null | undefined,
    options?: { client?: QueryClient },
  ): Promise<Material> {
    const executor = options?.client ?? this.db;

    const material = await this.findOne(materialId, options);

    // `pg` returns BIGINT columns as strings; ensure numeric math is performed.
    const currentStock = Number(material.on_hand_stock ?? 0);
    if (!Number.isFinite(currentStock)) {
      throw new BadRequestException(`Invalid stock value for material ${materialId}`);
    }

    const newStock = currentStock + quantity;

    if (newStock < 0) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${currentStock}, Requested: ${Math.abs(quantity)}`
      );
    }

    const updateQuery = `
      UPDATE tblmaterials
      SET on_hand_stock = $1, updated_at = NOW(), updated_by = $2
      WHERE id = $3
    `;

    await executor.query(updateQuery, [newStock, userId ?? null, materialId]);

    return this.findOne(materialId, options);
  }

  /**
   * =====================================================
   * ADJUST STOCK
   * =====================================================
   * Performs a stock adjustment (increase or decrease)
   *
   * Steps:
   * 1. Validate quantity (1 to 999999)
   * 2. Validate remarks length (<= 500 chars)
   * 3. Find the material (throws 404 if not found)
   * 4. If decrease, check that stock won't go below zero
   * 5. Update on_hand_stock on the material
   * 6. Record a Stock_Movement with movement_type = 'ADJUST'
   * 7. Return updated material data
   *
   * @param materialId - Material ID
   * @param dto - StockAdjustmentDto with direction, quantity, remarks
   * @param userId - User performing the adjustment
   * =====================================================
   */
  async adjustStock(
    materialId: number,
    dto: StockAdjustmentDto,
    userId: number,
  ): Promise<{ success: boolean; message: string; material: Material }> {
    // Step 1: Validate quantity
    if (!Number.isFinite(dto.quantity) || dto.quantity < 1 || dto.quantity > 999999) {
      throw new BadRequestException('Quantity must be between 1 and 999999');
    }

    // Step 2: Validate remarks length
    if (dto.remarks && dto.remarks.length > 500) {
      throw new BadRequestException('Remarks must not exceed 500 characters');
    }

    // Step 3: Find the material (throws 404 if not found)
    const material = await this.findOne(materialId);

    // Step 4: Calculate new stock
    const currentStock = Number(material.on_hand_stock ?? 0);
    const adjustmentQty = dto.direction === 'increase' ? dto.quantity : -dto.quantity;
    const newStock = currentStock + adjustmentQty;

    // Reject decrease if it would reduce stock below zero
    if (newStock < 0) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${currentStock}, Requested: ${dto.quantity}`,
      );
    }

    // Step 5: Update on_hand_stock
    const updateQuery = `
      UPDATE tblmaterials
      SET on_hand_stock = $1, updated_at = NOW(), updated_by = $2
      WHERE id = $3
    `;
    await this.db.query(updateQuery, [newStock, userId, materialId]);

    // Step 6: Record Stock_Movement with movement_type = 'ADJUST'
    const movementQuery = `
      INSERT INTO tblmaterial_stock_movement (
        material_id, movement_type, qty, source_type, source_id, source_line_key, remarks, created_by
      )
      VALUES ($1, 'ADJUST', $2, 'MANUAL', $3, $4, $5, $6)
    `;
    await this.db.query(movementQuery, [
      materialId,
      dto.direction === 'increase' ? dto.quantity : -dto.quantity,
      materialId,
      `ADJ-${materialId}-${Date.now()}`,
      dto.remarks || null,
      userId,
    ]);

    // Step 7: Return updated material
    const updatedMaterial = await this.findOne(materialId);

    return {
      success: true,
      message: `Stock ${dto.direction}d by ${dto.quantity}`,
      material: updatedMaterial,
    };
  }

  /**
   * =====================================================
   * RECORD STOCK DEFICIT
   * =====================================================
   * Records a stock deficit when a sales order line item's
   * ordered quantity exceeds the available on_hand_stock.
   *
   * Steps:
   * 1. Validate that orderedQty > onHandStock (deficit condition)
   * 2. Calculate deficit quantity (orderedQty - onHandStock)
   * 3. Record a Stock_Movement with movement_type='OUT',
   *    source_type='SO', source_id=salesOrderId,
   *    source_line_key=lineItemKey
   * 4. Set on_hand_stock to 0 (never below zero)
   * 5. Return the recorded movement and updated material
   *
   * @param params - StockDeficitParams
   * @returns Object with movement record and updated material
   * =====================================================
   */
  async recordStockDeficit(params: {
    materialId: number;
    orderedQty: number;
    onHandStock: number;
    salesOrderId: number;
    lineItemKey: string;
    userId: number;
  }): Promise<{ success: boolean; message: string; deficitQty: number; material: Material }> {
    const { materialId, orderedQty, onHandStock, salesOrderId, lineItemKey, userId } = params;

    // Step 1: Validate deficit condition
    if (orderedQty <= onHandStock) {
      return {
        success: false,
        message: 'No deficit: ordered quantity does not exceed on-hand stock',
        deficitQty: 0,
        material: await this.findOne(materialId),
      };
    }

    // Step 2: Calculate deficit quantity
    const deficitQty = orderedQty - onHandStock;

    // Step 3: Record Stock_Movement with movement_type='OUT'
    const remarks = `Stock deficit of ${deficitQty} units. Material sourced from another supplier.`;
    const movementQuery = `
      INSERT INTO tblmaterial_stock_movement (
        material_id, movement_type, qty, source_type, source_id, source_line_key, remarks, created_by
      )
      VALUES ($1, 'OUT', $2, 'SO', $3, $4, $5, $6)
    `;
    await this.db.query(movementQuery, [
      materialId,
      deficitQty,
      salesOrderId,
      lineItemKey,
      remarks,
      userId,
    ]);

    // Step 4: Set on_hand_stock to 0 (do NOT reduce below zero)
    const updateQuery = `
      UPDATE tblmaterials
      SET on_hand_stock = 0, updated_at = NOW(), updated_by = $1
      WHERE id = $2
    `;
    await this.db.query(updateQuery, [userId, materialId]);

    // Step 5: Return result
    const updatedMaterial = await this.findOne(materialId);

    return {
      success: true,
      message: `Stock deficit of ${deficitQty} units recorded for sales order ${salesOrderId}`,
      deficitQty,
      material: updatedMaterial,
    };
  }
}
