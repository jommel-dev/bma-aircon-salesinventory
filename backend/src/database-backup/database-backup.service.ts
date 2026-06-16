import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  private readonly schema: string;

  // ─── Setup Progress Tracking ────────────────────────────────────────────────
  private setupProgress = { status: 'idle' as 'idle' | 'running' | 'done' | 'error', progress: 0, total: 0, message: '', error: '' };

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.schema = this.configService.get<string>('DB_SCHEMA', 'public').trim();
  }

  getSetupProgress() {
    return { ...this.setupProgress };
  }

  startSchemaSetup(): void {
    if (this.setupProgress.status === 'running') return;
    this.setupProgress = { status: 'running', progress: 0, total: 0, message: 'Starting...', error: '' };
    void this.runSchemaSetup();
  }

  private async runSchemaSetup(): Promise<void> {
    try {
      // Ensure the schema exists before proceeding
      if (this.schema !== 'public') {
        try {
          await this.db.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
        } catch (err: any) {
          this.setupProgress = { ...this.setupProgress, status: 'error', error: `Failed to create schema: ${err?.message}` };
          return;
        }
      }

      const result = await this.initializeSchemaWithProgress();
      if (result.success) {
        this.setupProgress = { status: 'done', progress: this.setupProgress.total, total: this.setupProgress.total, message: result.message, error: '' };
      } else {
        this.setupProgress = { ...this.setupProgress, status: 'error', error: result.message };
      }
    } catch (err: any) {
      this.setupProgress = { ...this.setupProgress, status: 'error', error: err?.message ?? 'Unknown error' };
    }
  }

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
    parts.push(`-- Schema: ${this.schema}`);
    parts.push('');
    parts.push('SET statement_timeout = 0;');
    parts.push('SET lock_timeout = 0;');
    parts.push("SET client_encoding = 'UTF8';");
    parts.push('SET standard_conforming_strings = on;');
    parts.push(`SET search_path = ${this.schema}, pg_catalog;`);
    parts.push('');

    if (mode === 'full' || mode === 'schema_only') {
      // Export functions
      try {
        const functions = await this.exportFunctions();
        if (functions) {
          parts.push('-- ========================');
          parts.push('-- FUNCTIONS');
          parts.push('-- ========================');
          parts.push(functions);
          parts.push('');
        }
      } catch (err: any) {
        parts.push(`-- FUNCTIONS export skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
      }

      // Export sequences
      try {
        const sequences = await this.exportSequences();
        if (sequences) {
          parts.push('-- ========================');
          parts.push('-- SEQUENCES');
          parts.push('-- ========================');
          parts.push(sequences);
          parts.push('');
        }
      } catch (err: any) {
        parts.push(`-- SEQUENCES export skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
      }

      // Export tables (CREATE TABLE)
      try {
        const tables = await this.exportTableSchemas();
        if (tables) {
          parts.push('-- ========================');
          parts.push('-- TABLES');
          parts.push('-- ========================');
          parts.push(tables);
          parts.push('');
        }
      } catch (err: any) {
        parts.push(`-- TABLES export skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
      }

      // Export indexes
      try {
        const indexes = await this.exportIndexes();
        if (indexes) {
          parts.push('-- ========================');
          parts.push('-- INDEXES');
          parts.push('-- ========================');
          parts.push(indexes);
          parts.push('');
        }
      } catch (err: any) {
        parts.push(`-- INDEXES export skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
      }

      // Export triggers
      try {
        const triggers = await this.exportTriggers();
        if (triggers) {
          parts.push('-- ========================');
          parts.push('-- TRIGGERS');
          parts.push('-- ========================');
          parts.push(triggers);
          parts.push('');
        }
      } catch (err: any) {
        parts.push(`-- TRIGGERS export skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
      }

      // Export views
      try {
        const views = await this.exportViews();
        if (views) {
          parts.push('-- ========================');
          parts.push('-- VIEWS');
          parts.push('-- ========================');
          parts.push(views);
          parts.push('');
        }
      } catch (err: any) {
        parts.push(`-- VIEWS export skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
      }
    }

    if (mode === 'full' || mode === 'data_only') {
      // Export data (INSERT statements)
      try {
        const data = await this.exportTableData();
        if (data) {
          parts.push('-- ========================');
          parts.push('-- DATA');
          parts.push('-- ========================');
          parts.push(data);
          parts.push('');
        }
      } catch (err: any) {
        parts.push(`-- DATA export skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
      }

      // Reset sequences to current values
      if (mode === 'full') {
        try {
          const seqResets = await this.exportSequenceResets();
          if (seqResets) {
            parts.push('-- ========================');
            parts.push('-- SEQUENCE RESETS');
            parts.push('-- ========================');
            parts.push(seqResets);
            parts.push('');
          }
        } catch (err: any) {
          parts.push(`-- SEQUENCE RESETS skipped: ${err?.message?.slice(0, 100) ?? 'unknown error'}`);
        }
      }
    }

    const sql = parts.join('\n');

    // Record in history (don't let this fail the backup)
    try {
      await this.recordBackupHistory(mode, filename, Buffer.byteLength(sql, 'utf8'), userId);
    } catch {
      // Skip if history recording fails
    }

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
       WHERE table_schema = $1
         AND table_type = 'BASE TABLE'
         AND table_name NOT IN ('tblbackup_history')`,
      [this.schema],
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

    return this.executeSql(sql);
  }

  /**
   * Execute SQL statements directly (no blank check — caller must verify).
   */
  async executeSql(sql: string): Promise<{ success: boolean; message: string }> {
    try {
      // Try executing the entire SQL as a single batch first (much faster for remote DBs)
      try {
        await this.db.query(sql);
        return { success: true, message: 'Database imported successfully (batch mode).' };
      } catch (batchErr: any) {
        // If batch fails, fall back to statement-by-statement execution
        console.warn('Batch SQL execution failed, falling back to statement-by-statement:', batchErr?.message?.slice(0, 200));
      }

      // Fallback: split and execute one by one
      const statements = this.splitSqlStatements(sql);
      let executed = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;

        // Skip standalone BEGIN/COMMIT (we execute each statement in autocommit)
        const upper = trimmed.toUpperCase();
        if (upper === 'BEGIN;' || upper === 'BEGIN' || upper === 'COMMIT;' || upper === 'COMMIT') {
          skipped++;
          continue;
        }

        try {
          await this.db.query(trimmed);
          executed++;
        } catch (stmtErr: any) {
          const msg = stmtErr?.message ?? '';
          // Skip non-critical errors
          if (
            msg.includes('already exists') ||
            msg.includes('duplicate key') ||
            msg.includes('does not exist') ||
            msg.includes('could not create unique index')
          ) {
            skipped++;
            continue;
          }
          // Log but don't stop on other errors
          console.warn('SQL import warning:', msg.slice(0, 300));
          errors.push(msg.slice(0, 100));
          skipped++;
        }
      }

      const errSummary = errors.length > 0 ? ` (${errors.length} warnings)` : '';
      return {
        success: true,
        message: `Database imported successfully. ${executed} statements executed, ${skipped} skipped${errSummary}.`,
      };
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
       WHERE n.nspname = $1
         AND p.prokind IN ('f', 'p')
       ORDER BY p.proname`,
      [this.schema],
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
       WHERE schemaname = $1
       ORDER BY sequencename`,
      [this.schema],
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
       WHERE table_schema = $1
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [this.schema],
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
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [this.schema, tableName],
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
       WHERE tc.table_schema = $1
         AND tc.table_name = $2
         AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
      [this.schema, tableName],
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
       WHERE tc.table_schema = $1
         AND tc.table_name = $2
         AND tc.constraint_type = 'UNIQUE'
       ORDER BY tc.constraint_name, kcu.ordinal_position`,
      [this.schema, tableName],
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
       WHERE tc.table_schema = '${this.schema}'
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
       WHERE schemaname = $1
         AND indexdef NOT LIKE '%_pkey%'
         AND indexdef NOT LIKE '%UNIQUE%'
       ORDER BY tablename, indexname`,
      [this.schema],
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
       WHERE n.nspname = $1
         AND NOT t.tgisinternal
       ORDER BY c.relname, t.tgname`,
      [this.schema],
    );

    if (result.rows.length === 0) return '';

    return result.rows.map((r) => `${r.trigger_def};`).join('\n');
  }

  private async exportViews(): Promise<string> {
    const result = await this.db.query<{ view_name: string; view_definition: string }>(
      `SELECT table_name AS view_name, view_definition
       FROM information_schema.views
       WHERE table_schema = $1
       ORDER BY table_name`,
      [this.schema],
    );

    if (result.rows.length === 0) return '';

    return result.rows
      .map((r) => `CREATE OR REPLACE VIEW "${r.view_name}" AS\n${r.view_definition}`)
      .join('\n\n');
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
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [this.schema, tableName],
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
    try {
      const result = await this.db.query<{ sequence_name: string; last_value: string }>(
        `SELECT s.relname AS sequence_name,
                COALESCE(
                  (SELECT last_value::text FROM pg_sequences WHERE schemaname = $1 AND sequencename = s.relname),
                  '1'
                ) AS last_value
         FROM pg_class s
         JOIN pg_namespace n ON s.relnamespace = n.oid
         WHERE s.relkind = 'S' AND n.nspname = $1
         ORDER BY s.relname`,
        [this.schema],
      );

      if (result.rows.length === 0) return '';

      return result.rows
        .map((r) => `SELECT setval('"${r.sequence_name}"', ${r.last_value}, true);`)
        .join('\n');
    } catch {
      // If the query fails (e.g., permissions), skip sequence resets
      return '';
    }
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
      // Skip pure comment lines only when NOT in a dollar-quoted block
      if (!inDollarQuote && line.trim().startsWith('--')) {
        continue;
      }

      // Check for $$ or $tag$ delimiters
      // Count occurrences properly — each pair toggles the state
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
        const trimmed = current.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          statements.push(trimmed);
        }
        current = '';
      }
    }

    if (current.trim()) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
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

  // ─── Setup Methods ──────────────────────────────────────────────────────────

  /**
   * Initialize the database schema from the built-in SQL file.
   * Only works if the database is blank.
   */
  async initializeSchema(): Promise<{ success: boolean; message: string }> {
    const fs = await import('fs');
    const path = await import('path');

    // Create schema if not using 'public'
    if (this.schema !== 'public') {
      try {
        await this.db.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
        await this.db.query(`SET search_path TO "${this.schema}"`);
      } catch (err: any) {
        return { success: false, message: `Failed to create schema "${this.schema}": ${err?.message}` };
      }
    }

    // Try multiple possible locations for the schema file
    const possiblePaths = [
      path.join(process.cwd(), 'sql', 'supabase', '000_full_schema_init.sql'),
      path.join(process.cwd(), '..', 'sql', 'supabase', '000_full_schema_init.sql'),
      path.join(__dirname, '..', '..', 'sql', 'supabase', '000_full_schema_init.sql'),
    ];

    let schemaSql = '';
    for (const filePath of possiblePaths) {
      try {
        if (fs.existsSync(filePath)) {
          schemaSql = fs.readFileSync(filePath, 'utf8');
          break;
        }
      } catch {
        continue;
      }
    }

    if (!schemaSql) {
      return { success: false, message: 'Schema SQL file not found on server.' };
    }

    // Also load and append migration files
    const migrationsDir = path.join(process.cwd(), 'sql');
    const migrationFiles = [
      'sales_order_items_migration.sql',
      'sales_order_items_discount_migration.sql',
      'sales_order_payments_migration.sql',
      'backorder_table_migration.sql',
      'so_number_sequence_migration.sql',
      'so_number_from_sequence.sql',
      'so_status_migration.sql',
      'po_status_migration.sql',
      'brands_product_type_migration.sql',
      'auth_permissions_setup.sql',
      'fix_customer_balance_function.sql',
      'materials_product_type_id_migration.sql',
    ];

    for (const migFile of migrationFiles) {
      try {
        const migPath = path.join(migrationsDir, migFile);
        if (fs.existsSync(migPath)) {
          schemaSql += '\n' + fs.readFileSync(migPath, 'utf8');
        }
      } catch {
        // Skip missing migration files
      }
    }

    return this.executeSql(schemaSql);
  }

  /**
   * Same as initializeSchema but updates setupProgress as it executes.
   */
  private async initializeSchemaWithProgress(): Promise<{ success: boolean; message: string }> {
    const fs = await import('fs');
    const path = await import('path');

    this.setupProgress.message = 'Preparing schema...';

    // Create schema if not using 'public'
    if (this.schema !== 'public') {
      try {
        await this.db.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
        await this.db.query(`SET search_path TO "${this.schema}"`);
      } catch (err: any) {
        return { success: false, message: `Failed to create schema "${this.schema}": ${err?.message}` };
      }
    }

    // Load SQL files
    this.setupProgress.message = 'Loading SQL files...';

    const possiblePaths = [
      path.join(process.cwd(), 'sql', 'supabase', '000_full_schema_init.sql'),
      path.join(process.cwd(), '..', 'sql', 'supabase', '000_full_schema_init.sql'),
      path.join(__dirname, '..', '..', 'sql', 'supabase', '000_full_schema_init.sql'),
    ];

    let schemaSql = '';
    for (const filePath of possiblePaths) {
      try {
        if (fs.existsSync(filePath)) {
          schemaSql = fs.readFileSync(filePath, 'utf8');
          break;
        }
      } catch {
        continue;
      }
    }

    if (!schemaSql) {
      return { success: false, message: 'Schema SQL file not found on server.' };
    }

    const migrationsDir = path.join(process.cwd(), 'sql');
    const migrationFiles = [
      'sales_order_items_migration.sql',
      'sales_order_items_discount_migration.sql',
      'sales_order_payments_migration.sql',
      'backorder_table_migration.sql',
      'so_number_sequence_migration.sql',
      'so_number_from_sequence.sql',
      'so_status_migration.sql',
      'po_status_migration.sql',
      'brands_product_type_migration.sql',
      'auth_permissions_setup.sql',
      'fix_customer_balance_function.sql',
      'materials_product_type_id_migration.sql',
    ];

    for (const migFile of migrationFiles) {
      try {
        const migPath = path.join(migrationsDir, migFile);
        if (fs.existsSync(migPath)) {
          schemaSql += '\n' + fs.readFileSync(migPath, 'utf8');
        }
      } catch {
        // Skip missing migration files
      }
    }

    // Try batch execution first
    this.setupProgress.message = 'Executing schema (batch mode)...';
    this.setupProgress.total = 1;

    try {
      await this.db.query(schemaSql);
      this.setupProgress.progress = 1;
      return { success: true, message: 'Database initialized successfully (batch mode).' };
    } catch (batchErr: any) {
      console.warn('Batch execution failed, falling back to statement-by-statement:', batchErr?.message?.slice(0, 200));
    }

    // Fallback: statement by statement with progress
    this.setupProgress.message = 'Splitting SQL statements...';
    const statements = this.splitSqlStatements(schemaSql);
    const total = statements.length;
    this.setupProgress.total = total;
    this.setupProgress.progress = 0;

    let executed = 0;
    let skipped = 0;

    for (let i = 0; i < statements.length; i++) {
      const trimmed = statements[i].trim();
      if (!trimmed) { skipped++; this.setupProgress.progress = i + 1; continue; }

      const upper = trimmed.toUpperCase();
      if (upper === 'BEGIN;' || upper === 'BEGIN' || upper === 'COMMIT;' || upper === 'COMMIT') {
        skipped++;
        this.setupProgress.progress = i + 1;
        continue;
      }

      // Update progress message every 10 statements
      if (i % 10 === 0) {
        this.setupProgress.message = `Executing statement ${i + 1} of ${total}...`;
      }
      this.setupProgress.progress = i + 1;

      try {
        await this.db.query(trimmed);
        executed++;
      } catch (stmtErr: any) {
        const msg = stmtErr?.message ?? '';
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate key') ||
          msg.includes('does not exist') ||
          msg.includes('could not create unique index')
        ) {
          skipped++;
          continue;
        }
        console.warn(`SQL statement ${i + 1} warning:`, msg.slice(0, 200));
        skipped++;
      }
    }

    return {
      success: true,
      message: `Database initialized. ${executed} executed, ${skipped} skipped.`,
    };
  }

  /**
   * Create the first admin user. Only works if no users exist.
   */
  async createFirstAdmin(data: {
    fullName: string;
    username: string;
    password: string;
    email?: string;
  }): Promise<{ success: boolean; message: string }> {
    // Check if any users exist
    const usersCheck = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM tblusers`,
    );

    const userCount = Number(usersCheck.rows[0]?.count ?? 0);
    if (userCount > 0) {
      return { success: false, message: 'Users already exist. First admin setup is only available on a fresh database.' };
    }

    try {
      // Hash password using SHA1 (same as the login service)
      const { createHash } = await import('crypto');
      const hashedPassword = createHash('sha1').update(data.password).digest('hex');

      // Insert the admin user
      const insertResult = await this.db.query<{ id: number }>(
        `INSERT INTO tblusers (full_name, username, password, email, role)
         VALUES ($1, $2, $3, $4, 'superadmin')
         RETURNING id`,
        [data.fullName.trim(), data.username.trim(), hashedPassword, data.email?.trim() || null],
      );

      const userId = insertResult.rows[0]?.id;
      if (!userId) {
        return { success: false, message: 'Failed to create admin user.' };
      }

      // Link user to the superadmin RBAC role (tblrbac) for legacy menu/permission access
      try {
        // Find or create a superadmin role in tblrbac with all menus
        let rbacRoleId: number | null = null;

        const rbacResult = await this.db.query<{ id: number }>(
          `SELECT id FROM tblrbac WHERE LOWER("roleName") = 'superadmin' OR LOWER("roleName") = 'super admin' LIMIT 1`,
        );

        if (rbacResult.rows.length > 0) {
          rbacRoleId = rbacResult.rows[0].id;
        } else {
          // Create superadmin role with all menus
          const allMenus = 'dashboard,sales_order,purchase_order,inventory,quotation,accounting,user_management,settings,customers,payroll,projects,material_sales_order,purchase_order_materials';
          const allPermissions = 'canDoAll,canCreate,canRead,canUpdate,canDelete';
          const createRbac = await this.db.query<{ id: number }>(
            `INSERT INTO tblrbac ("roleName", "roleMenus", "rolePermission")
             VALUES ('SuperAdmin', $1, $2)
             RETURNING id`,
            [allMenus, allPermissions],
          );
          rbacRoleId = createRbac.rows[0]?.id ?? null;
        }

        // Update the user's roleId to point to this RBAC role
        if (rbacRoleId) {
          await this.db.query(
            `UPDATE tblusers SET "roleId" = $1 WHERE id = $2`,
            [rbacRoleId, userId],
          );
        }
      } catch (rbacErr: any) {
        console.warn('RBAC role assignment warning:', rbacErr?.message?.slice(0, 200));
        // Non-fatal — user is created but might need manual role assignment
      }

      // Also assign to auth_roles if that table exists (new RBAC system)
      try {
        const roleResult = await this.db.query<{ id: number }>(
          `SELECT id FROM auth_roles WHERE LOWER(name) = 'superadmin' LIMIT 1`,
        );
        if (roleResult.rows.length > 0) {
          await this.db.query(
            `INSERT INTO auth_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, roleResult.rows[0].id],
          );
        }
      } catch {
        // auth_roles table might not exist — skip
      }

      return { success: true, message: `Admin user "${data.username.trim()}" created successfully.` };
    } catch (err: any) {
      if (err?.message?.includes('duplicate') || err?.code === '23505') {
        return { success: false, message: 'Username already exists.' };
      }
      return { success: false, message: err?.message ?? 'Failed to create admin user.' };
    }
  }
}
