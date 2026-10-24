import { backupName, libpqUrl, toPrune } from './db-tools.js';

describe('backup helpers', () => {
  it('drops Prisma-only URL parameters but keeps sslmode', () => {
    expect(libpqUrl('postgresql://u:p@localhost:5432/mindease?schema=public')).toBe('postgresql://u:p@localhost:5432/mindease');
    expect(libpqUrl('postgresql://u:p@db.example.com/mindease?schema=public&sslmode=require')).toBe(
      'postgresql://u:p@db.example.com/mindease?sslmode=require',
    );
  });

  it('names backups so they sort by time', () => {
    expect(backupName(new Date('2026-10-25T09:30:12Z'))).toBe('mindease-20261025-0930.dump');
  });

  it('keeps only the newest backups and ignores other files', () => {
    const files = ['mindease-20261023-0200.dump', 'notes.txt', 'mindease-20261025-0200.dump', 'mindease-20261024-0200.dump'];
    expect(toPrune(files, 2)).toEqual(['mindease-20261023-0200.dump']);
    expect(toPrune(files, 14)).toEqual([]);
  });
});
