import { Injectable } from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { DatabaseService } from 'src/database/database.service';
import { PoolClient } from 'pg';

@Injectable()
export class BrandsService {
  constructor(private readonly databaseService: DatabaseService) {}

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

  async create(createBrandDto: CreateBrandDto) {
    const brandName = String(createBrandDto.name ?? '').trim();
    if (!brandName) {
      return {
        success: false,
        message: 'Brand name is required',
      };
    }

    const columns = await this.getTableColumns(this.databaseService, 'tblbrands');
    const nameColumn = this.pickColumn(columns, ['brandName', 'brand_name']);

    if (!nameColumn) {
      return {
        success: false,
        message: 'tblbrands name column is not configured',
      };
    }

    const duplicateCheck = await this.databaseService.query<{ id: number }>(
      `SELECT b.id
       FROM tblbrands b
       WHERE LOWER(TRIM(COALESCE(to_jsonb(b)->>$1, ''))) = LOWER(TRIM($2))
       LIMIT 1`,
      [nameColumn, brandName],
    );

    if ((duplicateCheck.rowCount ?? 0) > 0) {
      return {
        success: false,
        message: 'Brand already exists',
      };
    }

    const prefixColumn = this.pickColumn(columns, ['prefix', 'brandPrefix', 'brand_prefix']);
    const typeColumn = this.pickColumn(columns, ['type', 'brandType', 'brand_type']);

    const insertColumns = [`"${nameColumn}"`];
    const insertValues: any[] = [brandName];
    const valuePlaceholders = ['$1'];

    if (prefixColumn && createBrandDto.prefix) {
      insertColumns.push(`"${prefixColumn}"`);
      insertValues.push(String(createBrandDto.prefix).trim());
      valuePlaceholders.push(`$${insertValues.length}`);
    }

    if (typeColumn && createBrandDto.type) {
      insertColumns.push(`"${typeColumn}"`);
      insertValues.push(String(createBrandDto.type).trim());
      valuePlaceholders.push(`$${insertValues.length}`);
    }

    if (createBrandDto.product_type_id != null) {
      insertColumns.push(`"product_type_id"`);
      insertValues.push(createBrandDto.product_type_id);
      valuePlaceholders.push(`$${insertValues.length}`);
    }

    const insertResult = await this.databaseService.query<{ id: number }>(
      `INSERT INTO tblbrands (${insertColumns.join(', ')}) VALUES (${valuePlaceholders.join(', ')}) RETURNING id`,
      insertValues,
    ).catch(async (err) => {
      // If id auto-generation fails, insert with explicit next id
      if (err?.message?.includes('null value in column "id"') || err?.message?.includes('violates not-null constraint')) {
        const maxId = await this.databaseService.query<{ max_id: string }>(
          `SELECT COALESCE(MAX(id), 0)::text AS max_id FROM tblbrands`
        );
        const nextVal = Number(maxId.rows[0]?.max_id ?? 0) + 1;

        // Insert with explicit id since auto-generation isn't working
        const explicitColumns = ['"id"', ...insertColumns];
        const explicitValues = [nextVal, ...insertValues];
        const placeholders = explicitValues.map((_, i) => `$${i + 1}`).join(', ');
        return this.databaseService.query<{ id: number }>(
          `INSERT INTO tblbrands (${explicitColumns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          explicitValues,
        );
      }
      throw err;
    });

    return {
      success: true,
      message: 'Brand created successfully',
      item: {
        id: insertResult.rows[0]?.id ?? null,
        name: brandName,
      },
    };
  }

  async findAll() {
    try {
      const result = await this.databaseService.query<{
        id: number;
        name_value: string | null;
        type_value: string | null;
        prefix_value: string | null;
      }>(
        `SELECT
           b.id,
           COALESCE(
             to_jsonb(b)->>'name',
             to_jsonb(b)->>'brandName',
             to_jsonb(b)->>'brand_name'
           ) AS name_value,
           COALESCE(
             to_jsonb(b)->>'type',
             to_jsonb(b)->>'brandType',
             to_jsonb(b)->>'brand_type'
           ) AS type_value,
           COALESCE(
             to_jsonb(b)->>'prefix',
             to_jsonb(b)->>'brandPrefix',
             to_jsonb(b)->>'brand_prefix'
           ) AS prefix_value
         FROM tblbrands b
         ORDER BY b.id DESC`,
      );

      return {
        success: true,
        items: result.rows.map((row) => ({
          id: row.id,
          name: row.name_value ?? `Brand ${row.id}`,
          type: String(row.type_value ?? '').trim(),
          prefix: String(row.prefix_value ?? '').trim(),
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load brands',
        items: [],
      };
    }
  }

  async getMaterialBrands() {
    try {
      const result = await this.databaseService.query<{
        id: number;
        name_value: string | null;
        type_value: string | null;
        prefix_value: string | null;
        product_type_id: number | null;
      }>(
        `SELECT
           b.id,
           COALESCE(
             to_jsonb(b)->>'name',
             to_jsonb(b)->>'brandName',
             to_jsonb(b)->>'brand_name'
           ) AS name_value,
           COALESCE(
             to_jsonb(b)->>'type',
             to_jsonb(b)->>'brandType',
             to_jsonb(b)->>'brand_type'
           ) AS type_value,
           COALESCE(
             to_jsonb(b)->>'prefix',
             to_jsonb(b)->>'brandPrefix',
             to_jsonb(b)->>'brand_prefix'
           ) AS prefix_value,
           b.product_type_id
         FROM tblbrands b
         WHERE COALESCE(
           to_jsonb(b)->>'type',
           to_jsonb(b)->>'brandType',
           to_jsonb(b)->>'brand_type'
         ) = 'MAT'
         ORDER BY COALESCE(
           to_jsonb(b)->>'name',
           to_jsonb(b)->>'brandName',
           to_jsonb(b)->>'brand_name'
         ) ASC`,
      );

      return {
        success: true,
        items: result.rows.map((row) => ({
          id: row.id,
          name: row.name_value ?? `Brand ${row.id}`,
          type: String(row.type_value ?? '').trim(),
          prefix: String(row.prefix_value ?? '').trim(),
          product_type_id: row.product_type_id ?? null,
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load material brands',
        items: [],
      };
    }
  }

  async findOne(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid brand id' };
    }

    const result = await this.databaseService.query<{
      id: number;
      name_value: string | null;
    }>(
      `SELECT
         b.id,
         COALESCE(
           to_jsonb(b)->>'name',
           to_jsonb(b)->>'brandName',
           to_jsonb(b)->>'brand_name'
         ) AS name_value
       FROM tblbrands b
       WHERE b.id = $1
       LIMIT 1`,
      [id],
    );

    if ((result.rowCount ?? 0) === 0) {
      return { success: false, message: `Brand ${id} not found` };
    }

    const row = result.rows[0];
    return {
      success: true,
      item: {
        id: row.id,
        name: row.name_value ?? `Brand ${row.id}`,
      },
    };
  }

  async update(id: number, updateBrandDto: UpdateBrandDto) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid brand id' };
    }

    const brandName = String(updateBrandDto.name ?? '').trim();
    if (!brandName) {
      return {
        success: false,
        message: 'Brand name is required',
      };
    }

    const columns = await this.getTableColumns(this.databaseService, 'tblbrands');
    const nameColumn = this.pickColumn(columns, ['name', 'brandName', 'brand_name']);

    if (!nameColumn) {
      return {
        success: false,
        message: 'tblbrands name column is not configured',
      };
    }

    const duplicateCheck = await this.databaseService.query<{ id: number }>(
      `SELECT b.id
       FROM tblbrands b
       WHERE b.id <> $1
         AND LOWER(TRIM(COALESCE(to_jsonb(b)->>$2, ''))) = LOWER(TRIM($3))
       LIMIT 1`,
      [id, nameColumn, brandName],
    );

    if ((duplicateCheck.rowCount ?? 0) > 0) {
      return {
        success: false,
        message: 'Brand already exists',
      };
    }

    const updateColumns = [`"${nameColumn}" = $1`];
    const updateValues: any[] = [brandName];
    let updateIndex = 2;

    const prefixColumn = this.pickColumn(columns, ['prefix', 'brandPrefix', 'brand_prefix']);
    if (prefixColumn && updateBrandDto.prefix !== undefined) {
      updateColumns.push(`"${prefixColumn}" = $${updateIndex}`);
      updateValues.push(String(updateBrandDto.prefix).trim());
      updateIndex++;
    }

    const typeColumn = this.pickColumn(columns, ['type', 'brandType', 'brand_type']);
    if (typeColumn && updateBrandDto.type !== undefined) {
      updateColumns.push(`"${typeColumn}" = $${updateIndex}`);
      updateValues.push(String(updateBrandDto.type).trim());
      updateIndex++;
    }

    const updateResult = await this.databaseService.query<{ id: number }>(
      `UPDATE tblbrands
       SET ${updateColumns.join(', ')}
       WHERE id = $${updateIndex}
       RETURNING id`,
      [...updateValues, id],
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      return { success: false, message: `Brand ${id} not found` };
    }

    return {
      success: true,
      message: 'Brand updated successfully',
      item: {
        id,
        name: brandName,
      },
    };
  }

  async remove(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid brand id' };
    }

    const productCheck = await this.databaseService.query<{ id: number }>(
      `SELECT p.id
       FROM tblproducts p
       WHERE COALESCE(
         to_jsonb(p)->>'brandId',
         to_jsonb(p)->>'brand_id',
         to_jsonb(p)->>'brandid'
       ) = $1::text
       LIMIT 1`,
      [String(id)],
    );

    if ((productCheck.rowCount ?? 0) > 0) {
      return {
        success: false,
        message: 'Cannot delete brand with existing products',
      };
    }

    const deleteResult = await this.databaseService.query<{ id: number }>(
      `DELETE FROM tblbrands WHERE id = $1 RETURNING id`,
      [id],
    );

    if ((deleteResult.rowCount ?? 0) === 0) {
      return { success: false, message: `Brand ${id} not found` };
    }

    return {
      success: true,
      message: 'Brand deleted successfully',
    };
  }
}
