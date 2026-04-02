import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Serverless-safe Neon connection.
 * Uses HTTP driver — no persistent connection pool needed.
 * POSTGRES_URL comes from Vercel Marketplace Neon integration.
 */
export function getDb() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL is not set — provision Neon via Vercel Marketplace');
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export { schema };
