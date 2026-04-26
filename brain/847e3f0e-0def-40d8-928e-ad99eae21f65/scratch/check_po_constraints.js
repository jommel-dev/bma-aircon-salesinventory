const { Client } = require('pg');

async function checkConstraint() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/bagama_hvac',
  });
  await client.connect();
  
  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'tblpurchase_orders'::regclass AND contype = 'c';
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  
  await client.end();
}

checkConstraint().catch(console.error);
