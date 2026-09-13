import {
  buildImportBatches,
  classifyStatement,
  isIgnorableImportError,
  planImportStatements,
  splitSqlStatements,
} from './sql-import.util';

describe('sql-import.util', () => {
  it('keeps dollar-quoted functions as a single statement', () => {
    const sql = `
CREATE OR REPLACE FUNCTION public.generate_so_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.so_number := '2026-1';
  RETURN NEW;
END;
$function$
;
INSERT INTO "tblusers" ("id") VALUES (1);
`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('$function$');
    expect(statements[1]).toContain('INSERT INTO');
  });

  it('skips Supabase event-trigger helpers that fail on restore', () => {
    expect(classifyStatement('CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger AS $$ BEGIN NULL; END; $$;').phase).toBe('skip');
    expect(classifyStatement("SET search_path = public, pg_catalog;").phase).toBe('skip');
    expect(classifyStatement('BEGIN;').phase).toBe('skip');
  });

  it('defers foreign keys and triggers until after data', () => {
    const sql = `
CREATE TABLE IF NOT EXISTS "tblusers" ("id" bigint NOT NULL);
ALTER TABLE "tblusers" ADD CONSTRAINT "tblusers_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "tblrbac"("id");
CREATE TRIGGER trg_update_customer_balance_on_sales AFTER INSERT ON public.tblsales_order FOR EACH ROW EXECUTE FUNCTION update_customer_balance_on_sales();
INSERT INTO "tblusers" ("id") VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO "tblusers" ("id") VALUES (2) ON CONFLICT DO NOTHING;
SELECT setval('"tblusers_id_seq"', 2, true);
`;
    const phases = planImportStatements(sql).map((item) => item.phase);
    expect(phases).toEqual(['table', 'fk', 'trigger', 'data', 'data', 'seqreset']);

    const batches = buildImportBatches(sql);
    expect(batches.map((item) => item.phase)).toEqual(['table', 'data', 'seqreset', 'fk', 'trigger']);
    expect(batches[1].statementCount).toBe(2);
    expect(batches[1].sql).toContain('VALUES (1),');
    expect(batches[1].sql).toContain('(2)');
    expect(batches[1].sql).toContain('ON CONFLICT DO NOTHING');
  });

  it('batches only same-table inserts and stays under the row cap', () => {
    const inserts = Array.from({ length: 45 }, (_, index) =>
      `INSERT INTO "tblsales_order" ("id") VALUES (${index + 1}) ON CONFLICT DO NOTHING;`,
    );
    inserts.push('INSERT INTO "tblcustomer" ("id") VALUES (1) ON CONFLICT DO NOTHING;');
    const batches = buildImportBatches(inserts.join('\n'));
    const dataBatches = batches.filter((item) => item.phase === 'data');
    expect(dataBatches.length).toBe(3);
    expect(dataBatches[0].statementCount).toBe(40);
    expect(dataBatches[1].statementCount).toBe(5);
    expect(dataBatches[2].tableName).toBe('tblcustomer');
  });

  it('treats ownership and duplicate errors as ignorable', () => {
    expect(isIgnorableImportError('must be owner of function rls_auto_enable')).toBe(true);
    expect(isIgnorableImportError('duplicate key value violates unique constraint')).toBe(true);
    expect(isIgnorableImportError('insert or update on table violates foreign key')).toBe(false);
  });
});
