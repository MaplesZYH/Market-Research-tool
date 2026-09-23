import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const sql = await readFile(resolve(process.cwd(), 'migrations/001_init.sql'), 'utf8');
  await pool.query(sql);
  console.log('Database migration complete.');
} finally {
  await pool.end();
}
