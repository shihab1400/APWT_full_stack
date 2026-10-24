import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * pg_dump/pg_restore want a plain connection string; Prisma's "?schema=public"
 * isn't a libpq parameter, so query parameters other than sslmode are dropped.
 */
export function libpqUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get('sslmode');
  url.search = sslmode ? `?sslmode=${sslmode}` : '';
  return url.toString();
}

/** Finds a PostgreSQL client tool: PG_BIN first, then the Windows default install, then PATH. */
export function pgTool(name: 'pg_dump' | 'pg_restore'): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  if (process.env.PG_BIN) return join(process.env.PG_BIN, exe);
  if (process.platform === 'win32') {
    for (const version of ['18', '17', '16']) {
      const candidate = join('C:\\Program Files\\PostgreSQL', version, 'bin', exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  return exe;
}

export function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // No shell: arguments are passed as-is, so paths and URLs need no quoting.
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (err) => reject(new Error(`Could not start ${command}: ${err.message}. Set PG_BIN to PostgreSQL's bin folder.`)));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))));
  });
}

/** "mindease-20261025-0930.dump" in UTC, so names sort by time. */
export function backupName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return `mindease-${stamp}.dump`;
}

/** Which backups to delete so only the newest `keep` remain. */
export function toPrune(files: string[], keep: number): string[] {
  const backups = files.filter((f) => /^mindease-\d{8}-\d{4}\.dump$/.test(f)).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}
