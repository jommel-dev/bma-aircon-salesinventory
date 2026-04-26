/**
 * =====================================================
 * PARTS SERVICE
 * =====================================================
 * Purpose: Business logic layer for aircon parts management
 * 
 * This service handles:
 * 1. CRUD operations (Create, Read, Update, Delete)
 * 2. Price calculations (SRP, discount %, discounted price)
 * 3. Brand filtering (only ACU type brands for parts)
 * 
 * Database Table: tblparts
 * =====================================================
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreatePartsDto, UpdatePartsDto } from './dto/create-parts.dto';

export interface Parts {
  id: number;
  brandId: number | null;
  partsName: string;
  model: string | null;
  partsCode: string | null;
  srp: number;
  discountPercentage: number;
  discountedPrice: number;
  createdAt: Date;
  createdBy: number | null;
  updatedAt: Date | null;
  updatedBy: number | null;
}

@Injectable()
export class PartsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * =====================================================
   * CREATE PARTS
   * =====================================================
   * Creates a new parts item in the inventory
   */
  async create(createPartsDto: CreatePartsDto, userId: number): Promise<Parts> {
    // Calculate discounted price if srp and discountPercentage are provided
    let discountedPrice = 0;
    if (createPartsDto.srp !== undefined && createPartsDto.discountPercentage !== undefined) {
      discountedPrice = Number(createPartsDto.srp) * (1 - Number(createPartsDto.discountPercentage) / 100);
    }

    const result = await this.db.query(
      `INSERT INTO public.tblparts 
        (brand_id, parts_name, model, parts_code, srp, discount_percentage, discounted_price, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        createPartsDto.brandId ?? null,
        createPartsDto.partsName,
        createPartsDto.model ?? null,
        createPartsDto.partsCode ?? null,
        createPartsDto.srp ?? 0,
        createPartsDto.discountPercentage ?? 0,
        discountedPrice,
        userId,
      ],
    );

    return this.mapRowToParts(result.rows[0]);
  }

  /**
   * =====================================================
   * FIND ALL PARTS
   * =====================================================
   * Retrieves all parts with optional search and brand type filter
   */
  async findAll(search?: string, brandType?: string): Promise<Parts[]> {
    let query = `
      SELECT p.*, b."brandName" as "brandName", b.type as "brandType"
      FROM public.tblparts p
      LEFT JOIN public.tblbrands b ON b.id = p.brand_id
      WHERE p.deleted_at IS NULL
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.parts_name ILIKE $${paramIndex} OR p.model ILIKE $${paramIndex} OR p.parts_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (brandType) {
      query += ` AND b.type = $${paramIndex}`;
      params.push(brandType);
      paramIndex++;
    }

    query += ' ORDER BY p.parts_name ASC';

    const result = await this.db.query(query, params);
    return result.rows.map((row) => this.mapRowToParts(row));
  }

  /**
   * =====================================================
   * FIND ONE PARTS
   * =====================================================
   * Retrieves a single parts item by ID
   */
  async findOne(id: number): Promise<Parts> {
    const result = await this.db.query(
      `SELECT p.*, b."brandName" as "brandName", b.type as "brandType"
       FROM public.tblparts p
       LEFT JOIN public.tblbrands b ON b.id = p.brand_id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException(`Parts with ID ${id} not found`);
    }

    return this.mapRowToParts(result.rows[0]);
  }

  /**
   * =====================================================
   * UPDATE PARTS
   * =====================================================
   * Updates an existing parts item
   */
  async update(id: number, updatePartsDto: UpdatePartsDto): Promise<Parts> {
    // Check if parts exists
    await this.findOne(id);

    // Build dynamic update query
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updatePartsDto.brandId !== undefined) {
      updates.push(`brand_id = $${paramIndex++}`);
      params.push(updatePartsDto.brandId);
    }
    if (updatePartsDto.partsName !== undefined) {
      updates.push(`parts_name = $${paramIndex++}`);
      params.push(updatePartsDto.partsName);
    }
    if (updatePartsDto.model !== undefined) {
      updates.push(`model = $${paramIndex++}`);
      params.push(updatePartsDto.model);
    }
    if (updatePartsDto.partsCode !== undefined) {
      updates.push(`parts_code = $${paramIndex++}`);
      params.push(updatePartsDto.partsCode);
    }
    if (updatePartsDto.srp !== undefined) {
      updates.push(`srp = $${paramIndex++}`);
      params.push(updatePartsDto.srp);
    }
    if (updatePartsDto.discountPercentage !== undefined) {
      updates.push(`discount_percentage = $${paramIndex++}`);
      params.push(updatePartsDto.discountPercentage);
    }

    // Recalculate discounted price if srp or discountPercentage changed
    if (updatePartsDto.srp !== undefined || updatePartsDto.discountPercentage !== undefined) {
      const currentParts = await this.findOne(id);
      const srp = updatePartsDto.srp ?? currentParts.srp;
      const discountPercentage = updatePartsDto.discountPercentage ?? currentParts.discountPercentage;
      const discountedPrice = Number(srp) * (1 - Number(discountPercentage) / 100);
      updates.push(`discounted_price = $${paramIndex++}`);
      params.push(discountedPrice);
    }

    if (updates.length === 0) {
      return this.findOne(id);
    }

    params.push(id);
    const result = await this.db.query(
      `UPDATE public.tblparts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    return this.mapRowToParts(result.rows[0]);
  }

  /**
   * =====================================================
   * REMOVE PARTS
   * =====================================================
   * Soft deletes a parts item
   */
  async remove(id: number, userId: number): Promise<void> {
    await this.findOne(id);
    await this.db.query(
      `UPDATE public.tblparts SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [userId, id],
    );
  }

  /**
   * =====================================================
   * SEARCH PARTS
   * =====================================================
   * Searches parts by query string with optional brand type and brand ID filter
   */
  async searchParts(query: string, brandType?: string, brandId?: string | number): Promise<Parts[]> {
    let sql = `
      SELECT p.*, b."brandName" as "brandName", b.type as "brandType"
      FROM public.tblparts p
      LEFT JOIN public.tblbrands b ON b.id = p.brand_id
      WHERE p.deleted_at IS NULL
        AND (p.parts_name ILIKE $1 OR p.model ILIKE $1 OR p.parts_code ILIKE $1)
    `;
    const params: unknown[] = [`%${query}%`];
    let paramIndex = 2;

    if (brandType) {
      sql += ` AND b.type = $${paramIndex++}`;
      params.push(brandType);
    }

    if (brandId) {
      sql += ` AND p.brand_id = $${paramIndex++}`;
      params.push(brandId);
    }

    sql += ' ORDER BY p.parts_name ASC LIMIT 20';

    const result = await this.db.query(sql, params);
    return result.rows.map((row) => this.mapRowToParts(row));
  }

  /**
   * =====================================================
   * MAP ROW TO PARTS
   * =====================================================
   * Maps database row to Parts object
   */
  private mapRowToParts(row: Record<string, unknown>): Parts {
    return {
      id: Number(row.id),
      brandId: row.brand_id ? Number(row.brand_id) : null,
      partsName: String(row.parts_name ?? ''),
      model: row.model ? String(row.model) : null,
      partsCode: row.parts_code ? String(row.parts_code) : null,
      srp: row.srp ? Number(row.srp) : 0,
      discountPercentage: row.discount_percentage ? Number(row.discount_percentage) : 0,
      discountedPrice: row.discounted_price ? Number(row.discounted_price) : 0,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      createdBy: row.created_by ? Number(row.created_by) : null,
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : null,
      updatedBy: row.updated_by ? Number(row.updated_by) : null,
    };
  }
}