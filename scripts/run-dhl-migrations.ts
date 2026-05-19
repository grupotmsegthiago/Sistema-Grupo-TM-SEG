import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

(async () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'scripts/dhl-migrations.sql'), 'utf8');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    console.log('Aplicando scripts/dhl-migrations.sql...');
    await c.query(sql);
    console.log('OK — todas as instruções DDL executadas.');
  } catch (e: any) {
    console.error('Falhou:', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
