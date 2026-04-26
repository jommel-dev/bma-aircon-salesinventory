import { Client } from 'pg';

async function checkColumns() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/bagama_hvac',
  });
  await client.connect();
  
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'tbltransaction_product_items' 
    AND table_schema = current_schema()
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  
  await client.end();
}

checkColumns().catch(console.error);
