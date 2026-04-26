import { Client } from 'pg';

async function checkSchema() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/bagama_hvac',
  });
  await client.connect();
  
  console.log('--- tblparts samples ---');
  const parts = await client.query('SELECT * FROM tblparts LIMIT 1');
  console.log(JSON.stringify(parts.rows, null, 2));
  
  console.log('\n--- tblmaterials samples ---');
  const materials = await client.query('SELECT * FROM tblmaterials LIMIT 1');
  console.log(JSON.stringify(materials.rows, null, 2));
  
  await client.end();
}

checkSchema().catch(console.error);
