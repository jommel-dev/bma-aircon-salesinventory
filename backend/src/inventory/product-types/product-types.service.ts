import { Injectable } from '@nestjs/common';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { DatabaseService } from 'src/database/database.service';
import { PoolClient } from 'pg';

@Injectable()
export class ProductTypesService {
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

  async create(createProductTypeDto: CreateProductTypeDto) {
    const typeName = String(createProductTypeDto.name ?? '').trim();
    if (!typeName) {
      return {
        success: false,
        message: 'Product type name is required',
      };
    }

    const columns = await this.getTableColumns(this.databaseService, 'tblproducttypes');
    const nameColumn = this.pickColumn(columns, ['name', 'productType', 'product_type']);

    if (!nameColumn) {
      return {
        success: false,
        message: 'tblproducttypes name column is not configured',
      };
    }

    const duplicateCheck = await this.databaseService.query<{ id: number }>(
      `SELECT t.id
       FROM tblproducttypes t
       WHERE LOWER(TRIM(COALESCE(to_jsonb(t)->>$1, ''))) = LOWER(TRIM($2))
       LIMIT 1`,
      [nameColumn, typeName],
    );

    if ((duplicateCheck.rowCount ?? 0) > 0) {
      return {
        success: false,
        message: 'Product type already exists',
      };
    }

    const prefixColumn = this.pickColumn(columns, ['prefix', 'typePrefix', 'type_prefix']);

    const insertColumns = [`"${nameColumn}"`];
    const insertValues: any[] = [typeName];
    const valuePlaceholders = ['$1'];

    if (prefixColumn && createProductTypeDto.prefix) {
      insertColumns.push(`"${prefixColumn}"`);
      insertValues.push(String(createProductTypeDto.prefix).trim());
      valuePlaceholders.push(`$${insertValues.length}`);
    }

    const insertResult = await this.databaseService.query<{ id: number }>(
      `INSERT INTO tblproducttypes (${insertColumns.join(', ')}) VALUES (${valuePlaceholders.join(', ')}) RETURNING id`,
      insertValues,
    );

    return {
      success: true,
      message: 'Product type created successfully',
      item: {
        id: insertResult.rows[0]?.id ?? null,
        name: typeName,
      },
    };
  }

  async findAll() {
    try {
      const result = await this.databaseService.query<{
        id: number;
        product_type_value: string | null;
        prefix_value: string | null;
      }>(
        `SELECT
           t.id,
           COALESCE(
             to_jsonb(t)->>'productType',
             to_jsonb(t)->>'product_type',
             to_jsonb(t)->>'name'
           ) AS product_type_value,
           COALESCE(
             to_jsonb(t)->>'prefix',
             to_jsonb(t)->>'typePrefix',
             to_jsonb(t)->>'type_prefix'
           ) AS prefix_value
         FROM tblproducttypes t
         ORDER BY t.id DESC`,
      );

      return {
        success: true,
        items: result.rows.map((row) => ({
          id: row.id,
          name: row.product_type_value ?? `Product Type ${row.id}`,
          prefix: String(row.prefix_value ?? '').trim(),
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load product types',
        items: [],
      };
    }
  }

  async findOne(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid product type id' };
    }

    const result = await this.databaseService.query<{
      id: number;
      product_type_value: string | null;
      prefix_value: string | null;
    }>(
      `SELECT
         t.id,
         COALESCE(
           to_jsonb(t)->>'productType',
           to_jsonb(t)->>'product_type',
           to_jsonb(t)->>'name'
         ) AS product_type_value,
         COALESCE(
           to_jsonb(t)->>'prefix',
           to_jsonb(t)->>'typePrefix',
           to_jsonb(t)->>'type_prefix'
         ) AS prefix_value
       FROM tblproducttypes t
       WHERE t.id = $1
       LIMIT 1`,
      [id],
    );

    if ((result.rowCount ?? 0) === 0) {
      return { success: false, message: `Product type ${id} not found` };
    }

    const row = result.rows[0];
    return {
      success: true,
      item: {
        id: row.id,
        name: row.product_type_value ?? `Product Type ${row.id}`,
        prefix: String(row.prefix_value ?? '').trim(),
      },
    };
  }

  async update(id: number, updateProductTypeDto: UpdateProductTypeDto) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid product type id' };
    }

    const typeName = String(updateProductTypeDto.name ?? '').trim();
    if (!typeName) {
      return {
        success: false,
        message: 'Product type name is required',
      };
    }

    const columns = await this.getTableColumns(this.databaseService, 'tblproducttypes');
    const nameColumn = this.pickColumn(columns, ['name', 'productType', 'product_type']);

    if (!nameColumn) {
      return {
        success: false,
        message: 'tblproducttypes name column is not configured',
      };
    }

    const duplicateCheck = await this.databaseService.query<{ id: number }>(
      `SELECT t.id
       FROM tblproducttypes t
       WHERE t.id <> $1
         AND LOWER(TRIM(COALESCE(to_jsonb(t)->>$2, ''))) = LOWER(TRIM($3))
       LIMIT 1`,
      [id, nameColumn, typeName],
    );

    if ((duplicateCheck.rowCount ?? 0) > 0) {
      return {
        success: false,
        message: 'Product type already exists',
      };
    }

    const updateColumns = [`"${nameColumn}" = $1`];
    const updateValues: any[] = [typeName];
    let updateIndex = 2;

    const prefixColumn = this.pickColumn(columns, ['prefix', 'typePrefix', 'type_prefix']);
    if (prefixColumn && updateProductTypeDto.prefix !== undefined) {
      updateColumns.push(`"${prefixColumn}" = $${updateIndex}`);
      updateValues.push(String(updateProductTypeDto.prefix).trim());
      updateIndex++;
    }

    const updateResult = await this.databaseService.query<{ id: number }>(
      `UPDATE tblproducttypes
       SET ${updateColumns.join(', ')}
       WHERE id = $${updateIndex}
       RETURNING id`,
      [...updateValues, id],
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      return { success: false, message: `Product type ${id} not found` };
    }

    return {
      success: true,
      message: 'Product type updated successfully',
      item: {
        id,
        name: typeName,
      },
    };
  }

  async remove(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, message: 'Invalid product type id' };
    }

    const deleteResult = await this.databaseService.query<{ id: number }>(
      `DELETE FROM tblproducttypes WHERE id = $1 RETURNING id`,
      [id],
    );

    if ((deleteResult.rowCount ?? 0) === 0) {
      return { success: false, message: `Product type ${id} not found` };
    }

    return {
      success: true,
      message: 'Product type deleted successfully',
    };
  }
}
