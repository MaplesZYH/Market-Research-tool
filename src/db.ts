import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values);
}

export async function updateScan(id: string, patch: Record<string, unknown>) {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);
  await query(`UPDATE scans SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1`, [id, ...entries.map(([, value]) => value)]);
}
