const pg = require('pg');
const client = new pg.Client('postgresql://postgres:root@localhost:5432/bagama_hvac');

async function check() {
    try {
        await client.connect();
        const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'tbltransaction_product_items'");
        console.log('Columns in tbltransaction_product_items:', res.rows.map(c => c.column_name));
        
        const res2 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'tbltransaction_material_items'");
        console.log('Columns in tbltransaction_material_items:', res2.rows.map(c => c.column_name));

        const res3 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'tbltransaction_parts_items'");
        console.log('Columns in tbltransaction_parts_items:', res3.rows.map(c => c.column_name));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

check();
