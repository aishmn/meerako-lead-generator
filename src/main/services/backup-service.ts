/**
 * Automated Backup Service
 *
 * Copies the SQLite database file to a dated backup file once per day.
 * Keeps the last 7 backups and removes older ones.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';
import { getDatabasePath } from '../db';

const MAX_BACKUPS    = 7;
const CHECK_INTERVAL = 60 * 60 * 1000; // check every hour

let backupInterval: NodeJS.Timeout | null = null;

function backupDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

function todayLabel(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function backupPath(label: string): string {
  return path.join(backupDir(), `leadforge-${label}.db`);
}

async function runBackup(): Promise<void> {
  const src = getDatabasePath();
  if (!fs.existsSync(src)) return;

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });

  const dest = backupPath(todayLabel());
  if (fs.existsSync(dest)) return; // already backed up today

  try {
    fs.copyFileSync(src, dest);
    log.info(`[backup] created: ${dest}`);
    pruneOldBackups(dir);
  } catch (err) {
    log.error('[backup] failed', err);
  }
}

function pruneOldBackups(dir: string): void {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('leadforge-') && f.endsWith('.db'))
    .sort()
    .reverse();

  for (const file of files.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(dir, file));
      log.info(`[backup] pruned old backup: ${file}`);
    } catch { /* ignore */ }
  }
}

export function startBackupService(): void {
  if (backupInterval) return;
  // Run immediately, then on interval
  runBackup().catch((e) => log.warn('[backup] initial run failed', e));
  backupInterval = setInterval(
    () => runBackup().catch((e) => log.warn('[backup] scheduled run failed', e)),
    CHECK_INTERVAL
  );
}

export function stopBackupService(): void {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}
