import 'dotenv/config';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { backupName, libpqUrl, pgTool, run, toPrune } from './db-tools.js';

/**
 * Daily database backup (NFR: backups). Writes a compressed pg_dump archive to
 * BACKUP_DIR (default ./backups) and keeps the newest BACKUP_KEEP (default 14).
 * Usage: pnpm db:backup. Schedule it daily with cron or Windows Task Scheduler.
 *
 * Chats, notes and messages inside the dump stay encrypted; keep
 * DATA_ENCRYPTION_KEY backed up separately or they can't be restored.
 */
async function main() {
  const dir = resolve(process.env.BACKUP_DIR ?? 'backups');
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  await mkdir(dir, { recursive: true });

  const file = join(dir, backupName());
  await run(pgTool('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}`, libpqUrl(process.env.DATABASE_URL!)]);
  const { size } = await stat(file);
  console.log(`Backup written: ${file} (${(size / 1024).toFixed(0)} KB)`);

  for (const old of toPrune(await readdir(dir), keep)) {
    await rm(join(dir, old));
    console.log(`Removed old backup ${old}`);
  }
}

main().catch((err: unknown) => {
  console.error(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
