import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

export type BackupMode = 'full' | 'schema_only' | 'data_only';

interface BackupHistoryItem {
  id: number;
  mode: BackupMode;
  filename: string;
  size_bytes: number;
  created_at: string;
  created_by: number | null;
}

@Injectable()
export class DatabaseBackupService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Generate a SQL backup of the public schema.
   */
  async generateBackup(mode: BackupMode, userId?: number): Promise<{ sql: string; filename: string }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${mode}_${timestamp}.sql`;
    const parts: string[] = [];

    parts.push(`-- Database Backup (${mode})`);
    parts.push(`-- Generated: ${new Date().toISOString()}`);
    parts.push(`-- Mode: ${mode}`);
    parts.push('');
    parts.push('SET statement_timeout = 0;');
    parts.push('SET lock_timeout = 0;');
    parts.push("SET client_encoding = 'UTF8';");
    parts.push('SET standard_conforming_strings = on;');
    parts.push("SET search_path = public, pg_catalog;");
    parts.push('');

    if (mode === 'full' || mode === 'schema_only') {
      // Export functions
      const functions = await this.exportFunctions();
      if (functions) {
        parts.push('-- ========================');
        parts.push('-- FUNCTIONS');
        parts.push('-- ========================');
        parts.push(functions);
        parts.push('');
      }

      // Export sequences
      const sequences = await this.exportSequences();
      if (sequences) {
        parts.push('-- ========================');
        parts.push('-- SEQUENCES');
        parts.push('-- ========================');
        parts.push(sequences);
        parts.push('');
      }

      // Export tables (CREATE TABLE)
      const tables = await this.exportTableSchemas();
      if (tables) {
        parts.push('-- ========================');
        parts.push('-- TABLES');
        parts.push('-- ========================');
        parts.push(tables);
        parts.push('');
      }

      // Export indexes
      const indexes = await this.exportIndexes();
      if (indexes) {
        parts.push('-- ========================');
        parts.push('-- INDEXES');
        parts.push('-- ========================');
        parts.push(indexes);
        parts.push('');
      }

      // Export triggers
      const triggers = await this.exportTriggers();
      if (triggers) {
        parts.push('-- ========================');
        parts.push('-- TRIGGERS');
        parts.push('-- ========================');
        parts.push(triggers);
        parts.push('');
      }
    }

    if (mode === 'full' || mode === 'data_only') {
      // Export data (INSERT statements)
      const data = await this.exportTableData();
      if (data) {
        parts.push('-- ========================');
        parts.push('-- DATA');
        parts.push('-- ========================');
        parts.push(data);
        parts.push('');
      }

      // Reset sequences to current values
      if (mode === 'full') {
        const seqResets = await this.exportSequenceResets();
        if (seqResets) {
          parts.push('-- ========================');
          parts.push('-- SEQUENCE RESETS');
          parts.push('-- ========================');
          parts.push(seqResets);
          parts.push('');
        }
      }
    }

    const sql = parts.join('\n');

    // Record in history
    await this.recordBackupHistory(mode, filename, Buffer.byteLength(sql, 'utf8'), userId);

    return { sql, filename };
  }

  /**
   * Get backup history.
   */
  async getBackupHistory(): Promise<BackupHistoryItem[]> {
    try {
      const result = await this.db.query<BackupHistoryItem>(
        `SELECT id, mode, filename, size_bytes, created_at::text, created_by
         FROM tblbackup_history
         ORDER BY created_at DESC
         LIMIT 50`,
      );
      return result.rows;
    } catch {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Check if the database is blank (no user tables).
   */
  async isDatabaseBlank(): Promise<boolean> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name NOT IN ('tblbackup_history')`,
    );
    return Number(result.rows[0]?.count ?? 0) === 0;
  }

  /**
   * Import SQL into the database (only if blank).
   */
  async importSql(sql: string): Promise<{ success: boolean; message: string }> {
    const isBlank = await this.isDatabaseBlank();
    if (!isBlank) {
      return {
        success: false,
        message: 'Database is not empty. Import is only allowed on a blank database.',
      };
    }

    try {
      // Split by semicolons (basic SQL statement splitting)
      // For complex SQL with functions, use $$ delimiter awareness
      const statements = this.splitSqlStatements(sql);

      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;
        try {
          await this.db.query(trimmed);
        } catch (stmtErr: any) {
          // Log but continue on non-critical errors (e.g., "already exists")
          const msg = stmtErr?.message ?? '';
          if (msg.includes('already exists') || msg.includes('duplicate key')) {
            continue;
          }
          console.warn('Import statement warning:', msg.slice(0, 200));
        }
      }

      return { success: true, message: 'Database imported successfully.' };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message ?? 'Failed to import database.',
      };
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async exportFunctions(): Promise<string> {
    const result = await this.db.query<{ definition: string }>(
      `SELECT pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p
       JOIN pg_namespace n ON p.pronamespace = n.oid
       WHERE n.nspname = 'public'
         AND p.prokind IN ('f', 'p')
       ORDER BY p.proname`,
    );

    if (result.rows.length === 0) return '';

    return result.rows
      .map((r) => `${r.definition};\n`)
      .join('\n');
  }

  private async exportSequences(): Promise<string> {
    const result = await this.db.query<{
      sequencename: string;
      start_value: string;
      increment_by: string;
      min_value: string;
      max_value: string;
    }>(
      `SELECT sequencename, start_value::text, increment_by::text, min_value::text, max_value::text
       FROM pg_sequences
       WHERE schemaname = 'public'
       ORDER BY sequencename`,
    );

    if (result.rows.length === 0) return '';

    const parts: string[] = [];
    for (const row of result.rows) {
      parts.push(
        `CREATE SEQUENCE IF NOT EXISTS "${row.sequencename}" INCREMENT ${row.increment_by} MINVALUE ${row.min_value} START ${row.start_value};`,
      );
    }
    return parts.join('\n');
  }

  private async exportTableSchemas(): Promise<string> {
    // Get tables in dependency order (no FK references before the target table)
    const tables = await this.getTableNamesOrdered();
    const parts: string[] = [];

    for (const tableName of tables) {
      const createStmt = await this.getCreateTableStatement(tableName);
      if (createStmt) {
        parts.push(createStmt);
        parts.push('');
      }
    }

    // Foreign keys (added after all tables are created)
    const fks = await this.exportForeignKeys();
    if (fks) {
      parts.push('-- Foreign Keys');
      parts.push(fks);
    }

    return parts.join('\n');
  }

  private async getTableNamesOrdered(): Promise<string[]> {
    const result = await this.db.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    return result.rows.map((r) => r.table_name);
  }

  private async getCreateTableStatement(tableName: string): Promise<string> {
    const columns = await this.db.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
      is_generated: string;
      generation_expression: string | null;
    }>(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default,
              character_maximum_length, numeric_precision, numeric_scale,
              COALESCE(is_generated, 'NEVER') as is_generated,
              generation_expression
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );

    if (columns.rows.length === 0) return '';

    const colDefs: string[] = [];
    for (const col of columns.rows) {
      let typeStr = this.mapColumnType(col);
      let def = `  "${col.column_name}" ${typeStr}`;

      if (col.column_default && col.is_generated === 'NEVER') {
        def += ` DEFAULT ${col.column_default}`;
      }
      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }
      if (col.is_generated !== 'NEVER' && col.generation_expression) {
        def += ` GENERATED ALWAYS AS (${col.generation_expression}) STORED`;
      }
      colDefs.push(def);
    }

    // Primary key
    const pkResult = await this.db.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public'
         AND tc.table_name = $1
         AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
      [tableName],
    );

    if (pkResult.rows.length > 0) {
      const pkCols = pkResult.rows.map((r) => `"${r.column_name}"`).join(', ');
      colDefs.push(`  PRIMARY KEY (${pkCols})`);
    }

    // Unique constraints
    const uniqResult = await this.db.query<{ constraint_name: string; column_name: string }>(
      `SELECT tc.constraint_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public'
         AND tc.table_name = $1
         AND tc.constraint_type = 'UNIQUE'
       ORDER BY tc.constraint_name, kcu.ordinal_position`,
      [tableName],
    );

    const uniqueGroups = new Map<string, string[]>();
    for (const r of uniqResult.rows) {
      if (!uniqueGroups.has(r.constraint_name)) uniqueGroups.set(r.constraint_name, []);
      uniqueGroups.get(r.constraint_name)!.push(`"${r.column_name}"`);
    }
    for (const [, cols] of uniqueGroups) {
      colDefs.push(`  UNIQUE (${cols.join(', ')})`);
    }

    return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs.join(',\n')}\n);`;
  }

  private mapColumnType(col: {
    data_type: string;
    udt_name: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
  }): string {
    const udt = col.udt_name;

    // Array types
    if (udt.startsWith('_')) {
      return `${udt.slice(1)}[]`;
    }

    switch (col.data_type) {
      case 'character varying':
        return col.character_maximum_length
          ? `varchar(${col.character_maximum_length})`
          : 'varchar';
      case 'character':
        return col.character_maximum_length
          ? `char(${col.character_maximum_length})`
          : 'char';
      case 'numeric':
        if (col.numeric_precision && col.numeric_scale) {
          return `numeric(${col.numeric_precision},${col.numeric_scale})`;
        }
        return 'numeric';
      case 'ARRAY':
        return `${udt.replace(/^_/, '')}[]`;
      case 'USER-DEFINED':
        return udt;
      default:
        return col.data_type;
    }
  }

  private async exportForeignKeys(): Promise<string> {
    const result = await this.db.query<{
      constraint_name: string;
      table_name: string;
      column_name: string;
      foreign_table: string;
      foreign_column: string;
    }>(
      `SELECT
         tc.constraint_name,
         tc.table_name,
         kcu.column_name,
         ccu.table_name AS foreign_table,
         ccu.column_name AS foreign_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
       WHERE tc.table_schema = 'public'
         AND tc.constraint_type = 'FOREIGN KEY'
       ORDER BY tc.table_name, tc.constraint_name`,
    );

    if (result.rows.length === 0) return '';

    return result.rows
      .map(
        (r) =>
          `ALTER TABLE "${r.table_name}" ADD CONSTRAINT "${r.constraint_name}" FOREIGN KEY ("${r.column_name}") REFERENCES "${r.foreign_table}"("${r.foreign_column}");`,
      )
      .join('\n');
  }

  private async exportIndexes(): Promise<string> {
    const result = await this.db.query<{ indexdef: string }>(
      `SELECT indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexdef NOT LIKE '%_pkey%'
         AND indexdef NOT LIKE '%UNIQUE%'
       ORDER BY tablename, indexname`,
    );

    if (result.rows.length === 0) return '';

    return result.rows.map((r) => `${r.indexdef};`).join('\n');
  }

  private async exportTriggers(): Promise<string> {
    const result = await this.db.query<{ trigger_def: string }>(
      `SELECT pg_get_triggerdef(t.oid) AS trigger_def
       FROM pg_trigger t
       JOIN pg_class c ON t.tgrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'public'
         AND NOT t.tgisinternal
       ORDER BY c.relname, t.tgname`,
    );

    if (result.rows.length === 0) return '';

    return result.rows.map((r) => `${r.trigger_def};`).join('\n');
  }

  private async exportTableData(): Promise<string> {
    const tables = await this.getTableNamesOrdered();
    const parts: string[] = [];

    for (const tableName of tables) {
      const countResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM "${tableName}"`,
      );
      const count = Number(countResult.rows[0]?.count ?? 0);
      if (count === 0) continue;

      // Get column names
      const colResult = await this.db.query<{ column_name: string; is_generated: string }>(
        `SELECT column_name, COALESCE(is_generated, 'NEVER') as is_generated
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName],
      );

      // Exclude generated columns from INSERT
      const insertableCols = colResult.rows
        .filter((c) => c.is_generated === 'NEVER')
        .map((c) => c.column_name);

      if (insertableCols.length === 0) continue;

      const colList = insertableCols.map((c) => `"${c}"`).join(', ');

      // Fetch data in batches
      const batchSize = 500;
      let offset = 0;

      while (offset < count) {
        const dataResult = await this.db.query(
          `SELECT ${colList} FROM "${tableName}" ORDER BY 1 LIMIT ${batchSize} OFFSET ${offset}`,
        );

        for (const row of dataResult.rows) {
          const values = insertableCols.map((col) => this.escapeValue((row as any)[col]));
          parts.push(
            `INSERT INTO "${tableName}" (${colList}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;`,
          );
        }

        offset += batchSize;
      }

      parts.push('');
    }

    return parts.join('\n');
  }

  private async exportSequenceResets(): Promise<string> {
    const result = await this.db.query<{ sequence_name: string; last_value: string }>(
      `SELECT s.relname AS sequence_name, COALESCE(pg_sequence_last_value(s.oid)::text, '1') AS last_value
       FROM pg_class s
       JOIN pg_namespace n ON s.relnamespace = n.oid
       WHERE s.relkind = 'S' AND n.nspname = 'public'
       ORDER BY s.relname`,
    );

    if (result.rows.length === 0) return '';

    return result.rows
      .map((r) => `SELECT setval('"${r.sequence_name}"', ${r.last_value}, true);`)
      .join('\n');
  }

  private escapeValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (typeof value === 'object') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    }
    // String
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  private splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inDollarQuote = false;
    let dollarTag = '';
    const lines = sql.split('\n');

    for (const line of lines) {
      // Skip comment-only lines
      if (line.trim().startsWith('--')) {
        continue;
      }

      // Check for $$ or $tag$ delimiters
      const dollarMatches = line.match(/\$([a-zA-Z_]*)\$/g);
      if (dollarMatches) {
        for (const match of dollarMatches) {
          if (!inDollarQuote) {
            inDollarQuote = true;
            dollarTag = match;
          } else if (match === dollarTag) {
            inDollarQuote = false;
            dollarTag = '';
          }
        }
      }

      current += line + '\n';

      // If not in a dollar-quoted block and line ends with ;
      if (!inDollarQuote && line.trimEnd().endsWith(';')) {
        statements.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) {
      statements.push(current.trim());
    }

    return statements;
  }

  private async recordBackupHistory(
    mode: BackupMode,
    filename: string,
    sizeBytes: number,
    userId?: number,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO tblbackup_history (mode, filename, size_bytes, created_by)
         VALUES ($1, $2, $3, $4)`,
        [mode, filename, sizeBytes, userId ?? null],
      );
    } catch {
      // Table might not exist, create it
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS tblbackup_history (
           id SERIAL PRIMARY KEY,
           mode VARCHAR(20) NOT NULL,
           filename VARCHAR(255) NOT NULL,
           size_bytes INTEGER NOT NULL DEFAULT 0,
           created_at TIMESTAMP DEFAULT NOW(),
           created_by INTEGER
         )`,
      );
      await this.db.query(
        `INSERT INTO tblbackup_history (mode, filename, size_bytes, created_by)
         VALUES ($1, $2, $3, $4)`,
        [mode, filename, sizeBytes, userId ?? null],
      );
    }
  }
}
