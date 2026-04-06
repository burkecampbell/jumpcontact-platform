import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL not set');
  const sql = neon(url);
  await sql`DELETE FROM daily_snapshots`;
  const result = await sql`SELECT count(*) as c FROM daily_snapshots`;
  console.log('Remaining rows:', result[0].c);
}

main().catch(console.error);
