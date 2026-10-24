import 'dotenv/config';
import { existsSync } from 'node:fs';
import { libpqUrl, pgTool, run } from './db-tools.js';

/**
 * Restores a backup made by db:backup into DATABASE_URL, replacing what is there.
 * Usage: pnpm db:restore backups/mindease-20261025-0930.dump --yes
 */
async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file || !existsSync(file)) throw new Error('Pass the path of a .dump file made by db:backup');
  if (!process.argv.includes('--yes')) {
    throw new Error('This replaces all data in the database. Re-run with --yes to confirm.');
  }
  await run(pgTool('pg_restore'), [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--single-transaction',
    `--dbname=${libpqUrl(process.env.DATABASE_URL!)}`,
    file,
  ]);
  console.log(`Restored ${file}`);
}

main().catch((err: unknown) => {
  console.error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
