export type ImportPhase =
  | 'skip'
  | 'function'
  | 'sequence'
  | 'table'
  | 'view'
  | 'index'
  | 'fk'
  | 'trigger'
  | 'data'
  | 'seqreset'
  | 'other';

export interface PlannedStatement {
  sql: string;
  phase: ImportPhase;
  tableName?: string;
}

export interface ImportBatch {
  sql: string;
  phase: ImportPhase;
  tableName?: string;
  statementCount: number;
}

const INSERT_BATCH_SIZE = 40;
const INSERT_BATCH_MAX_CHARS = 180_000;

const SKIP_PATTERNS: RegExp[] = [
  /rls_auto_enable/i,
  /\bevent_trigger\b/i,
  /^create\s+event\s+trigger\b/i,
  /^alter\s+.*\bowner\s+to\b/i,
  /^(grant|revoke)\b/i,
];

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';
  const lines = sql.split('\n');

  for (const line of lines) {
    if (!inDollarQuote && line.trim().startsWith('--')) {
      continue;
    }

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

export function classifyStatement(sql: string): PlannedStatement {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();
  const compact = upper.replace(/\s+/g, ' ');

  if (!trimmed) {
    return { sql: trimmed, phase: 'skip' };
  }

  if (compact === 'BEGIN;' || compact === 'BEGIN' || compact === 'COMMIT;' || compact === 'COMMIT') {
    return { sql: trimmed, phase: 'skip' };
  }

  if (compact.startsWith('SET ')) {
    return { sql: trimmed, phase: 'skip' };
  }

  if (SKIP_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { sql: trimmed, phase: 'skip' };
  }

  if (compact.startsWith('INSERT INTO ')) {
    const tableName = extractIdentifier(trimmed, /insert\s+into\s+/i);
    return { sql: trimmed, phase: 'data', tableName };
  }

  if (compact.startsWith('SELECT SETVAL')) {
    return { sql: trimmed, phase: 'seqreset' };
  }

  if (compact.startsWith('CREATE SEQUENCE') || compact.startsWith('CREATE UNLOGGED SEQUENCE')) {
    return { sql: trimmed, phase: 'sequence' };
  }

  if (compact.startsWith('CREATE TABLE')) {
    const tableName = extractIdentifier(trimmed, /create\s+table(?:\s+if\s+not\s+exists)?\s+/i);
    return { sql: trimmed, phase: 'table', tableName };
  }

  if (compact.includes(' FOREIGN KEY ')) {
    return { sql: trimmed, phase: 'fk' };
  }

  if (compact.startsWith('CREATE TRIGGER') || compact.startsWith('CREATE OR REPLACE TRIGGER')) {
    return { sql: trimmed, phase: 'trigger' };
  }

  if (
    compact.startsWith('CREATE INDEX') ||
    compact.startsWith('CREATE UNIQUE INDEX') ||
    compact.startsWith('CREATE OR REPLACE INDEX')
  ) {
    return { sql: trimmed, phase: 'index' };
  }

  if (compact.includes(' VIEW ')) {
    return { sql: trimmed, phase: 'view' };
  }

  if (compact.startsWith('CREATE') && compact.includes(' FUNCTION ')) {
    return { sql: trimmed, phase: 'function' };
  }

  return { sql: trimmed, phase: 'other' };
}

export function planImportStatements(sql: string): PlannedStatement[] {
  return splitSqlStatements(sql)
    .map(classifyStatement)
    .filter((statement) => statement.phase !== 'skip' && statement.sql);
}

export function buildImportBatches(sql: string): ImportBatch[] {
  const planned = planImportStatements(sql);
  const grouped: Record<Exclude<ImportPhase, 'skip'>, PlannedStatement[]> = {
    function: [],
    sequence: [],
    table: [],
    view: [],
    other: [],
    data: [],
    seqreset: [],
    index: [],
    fk: [],
    trigger: [],
  };

  for (const statement of planned) {
    if (statement.phase === 'skip') continue;
    grouped[statement.phase].push(statement);
  }

  const batches: ImportBatch[] = [];

  for (const phase of ['function', 'sequence', 'table', 'view', 'other'] as const) {
    for (const statement of grouped[phase]) {
      batches.push({
        sql: statement.sql,
        phase,
        tableName: statement.tableName,
        statementCount: 1,
      });
    }
  }

  batches.push(...batchInserts(grouped.data));

  for (const phase of ['seqreset', 'index', 'fk', 'trigger'] as const) {
    for (const statement of grouped[phase]) {
      batches.push({
        sql: statement.sql,
        phase,
        tableName: statement.tableName,
        statementCount: 1,
      });
    }
  }

  return batches;
}

export function isIgnorableImportError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('already exists') ||
    msg.includes('duplicate key') ||
    msg.includes('must be owner') ||
    msg.includes('permission denied') ||
    msg.includes('must be superuser') ||
    msg.includes('event trigger') ||
    msg.includes('rls_auto_enable') ||
    msg.includes('could not create unique index')
  );
}

export function isRetryableImportError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('terminating connection') ||
    msg.includes('connection terminated') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('too many connections') ||
    msg.includes('remaining connection slots') ||
    msg.includes('server closed the connection') ||
    msg.includes('cannot acquire') ||
    msg.includes('max clients') ||
    msg.includes('computational resources') ||
    msg.includes('statement timeout') ||
    msg.includes('canceling statement')
  );
}

function batchInserts(statements: PlannedStatement[]): ImportBatch[] {
  const batches: ImportBatch[] = [];
  let current: PlannedStatement[] = [];
  let currentChars = 0;
  let currentTable: string | undefined;

  const flush = () => {
    if (current.length === 0) return;
    batches.push({
      sql: mergeInserts(current.map((item) => item.sql)),
      phase: 'data',
      tableName: currentTable,
      statementCount: current.length,
    });
    current = [];
    currentChars = 0;
    currentTable = undefined;
  };

  for (const statement of statements) {
    const sameTable = currentTable == null || currentTable === statement.tableName;
    const nextChars = currentChars + statement.sql.length + 1;
    if (!sameTable || current.length >= INSERT_BATCH_SIZE || nextChars > INSERT_BATCH_MAX_CHARS) {
      flush();
    }
    current.push(statement);
    currentChars += statement.sql.length + 1;
    currentTable = statement.tableName;
  }

  flush();
  return batches;
}

function mergeInserts(statements: string[]): string {
  if (statements.length === 1) return statements[0];

  const parsed = statements.map(parseInsert);
  if (parsed.some((item) => !item)) {
    return statements.join('\n');
  }

  const first = parsed[0]!;
  const sameShape = parsed.every(
    (item) => item && item.table === first.table && item.columns === first.columns && item.conflict === first.conflict,
  );
  if (!sameShape) {
    return statements.join('\n');
  }

  const values = parsed.map((item) => item!.values).join(',\n');
  return `INSERT INTO ${first.table} (${first.columns}) VALUES ${values}${first.conflict ? ` ${first.conflict}` : ''}`;
}

function parseInsert(sql: string): { table: string; columns: string; values: string; conflict: string } | null {
  const header = sql.match(/^INSERT\s+INTO\s+(.+?)\s+\(([\s\S]+?)\)\s+VALUES\s+/i);
  if (!header) return null;

  let rest = sql.slice(header[0].length).trim().replace(/;+\s*$/, '');
  const conflictMatch = rest.match(/\s+ON\s+CONFLICT[\s\S]*$/i);
  let values = rest;
  let conflict = '';
  if (conflictMatch) {
    values = rest.slice(0, rest.length - conflictMatch[0].length).trim();
    conflict = conflictMatch[0].trim();
  }

  if (!values.startsWith('(')) return null;

  return {
    table: header[1].trim(),
    columns: header[2].trim(),
    values,
    conflict,
  };
}

function extractIdentifier(sql: string, prefix: RegExp): string | undefined {
  const withoutPrefix = sql.replace(prefix, '');
  const quoted = withoutPrefix.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  const dotted = withoutPrefix.match(/^([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)/);
  if (dotted) return dotted[2];
  const plain = withoutPrefix.match(/^([a-zA-Z_][\w]*)/);
  return plain?.[1];
}
