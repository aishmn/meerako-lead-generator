import fs   from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import log from 'electron-log/main';
import * as schema from '../../db/schema';
import { normalizeWebsite } from './services/crawler-service';
import { normalizePhone }   from './services/phone-service';
import type { Lead } from '../lib/types';

// ─── Production guard ─────────────────────────────────────────────────────────
// Any code path that imports mock data MUST call this first. Throws in
// production so a mock import in a packaged build fails loudly.
export function assertDevOnly(feature: string): void {
  if (app.isPackaged) {
    throw new Error(`[PRODUCTION GUARD] "${feature}" is only available in development mode.`);
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

let sqlite: Database.Database | null = null;
let db:     BetterSQLite3Database<typeof schema> | null = null;
let databasePath = '';

function resolveMigrationPath(): string {
  const candidates = [
    path.join(process.cwd(), 'db', 'migrations', '0000_init.sql'),
    path.resolve(__dirname, '../../db/migrations/0000_init.sql'),
    path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? '', 'db', 'migrations', '0000_init.sql'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Migration not found. Checked:\n${candidates.join('\n')}`);
  return found;
}

function hasTable(conn: Database.Database, tableName: string): boolean {
  const row = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function getColumnNames(conn: Database.Database, tableName: string): Set<string> {
  const rows = conn.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

function rebuildLegacyLeadsTable(conn: Database.Database): void {
  if (!hasTable(conn, 'leads')) return;
  const cols = getColumnNames(conn, 'leads');
  const hasLegacyRequiredPersonCols = cols.has('first_name') || cols.has('last_name') || cols.has('company');
  if (!hasLegacyRequiredPersonCols) return;

  log.info('[db] detected legacy leads schema, rebuilding table to current format');

  conn.exec('PRAGMA foreign_keys = OFF');
  conn.exec('BEGIN');
  try {
    conn.exec(`
      CREATE TABLE IF NOT EXISTS leads_new (
        id                 TEXT    PRIMARY KEY NOT NULL,
        name               TEXT    NOT NULL,
        category           TEXT,
        company_domain     TEXT,
        website            TEXT,
        website_normalized TEXT,
        phone              TEXT,
        phone_normalized   TEXT,
        email              TEXT,
        address            TEXT,
        city               TEXT,
        country            TEXT,
        latitude           REAL,
        longitude          REAL,
        osm_type           TEXT,
        osm_id             TEXT,
        source             TEXT    NOT NULL DEFAULT 'manual',
        source_ref         TEXT,
        status             TEXT    NOT NULL DEFAULT 'new',
        notes_count        INTEGER NOT NULL DEFAULT 0,
        score              INTEGER NOT NULL DEFAULT 0,
        raw_tags           TEXT,
        crawl_status       TEXT    DEFAULT 'pending',
        crawl_emails       TEXT,
        crawl_phones       TEXT,
        crawl_social       TEXT,
        crawled_at         INTEGER,
        created_at         INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at         INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);

    conn.exec(`
      INSERT INTO leads_new (
        id, name, category, company_domain,
        website, website_normalized, phone, phone_normalized, email,
        address, city, country, latitude, longitude,
        osm_type, osm_id,
        source, source_ref, status, notes_count, score, raw_tags,
        crawl_status, crawl_emails, crawl_phones, crawl_social, crawled_at,
        created_at, updated_at
      )
      SELECT
        id,
        COALESCE(
          NULLIF(name, ''),
          NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''),
          NULLIF(company, ''),
          'Unnamed'
        ) AS name,
        category,
        company_domain,
        website,
        website_normalized,
        phone,
        phone_normalized,
        email,
        address,
        city,
        country,
        latitude,
        longitude,
        osm_type,
        osm_id,
        COALESCE(source, 'manual') AS source,
        source_ref,
        COALESCE(status, 'new') AS status,
        COALESCE(notes_count, 0) AS notes_count,
        0 AS score,
        raw_tags,
        COALESCE(
          crawl_status,
          CASE WHEN website IS NOT NULL AND website != '' THEN 'pending' ELSE 'skipped' END
        ) AS crawl_status,
        crawl_emails,
        crawl_phones,
        crawl_social,
        crawled_at,
        COALESCE(created_at, (unixepoch() * 1000)) AS created_at,
        COALESCE(updated_at, created_at, (unixepoch() * 1000)) AS updated_at
      FROM leads
    `);

    conn.exec('DROP TABLE leads');
    conn.exec('ALTER TABLE leads_new RENAME TO leads');
    conn.exec('COMMIT');
    log.info('[db] rebuilt leads table to current schema');
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  } finally {
    conn.exec('PRAGMA foreign_keys = ON');
  }
}

function ensureLeadColumns(conn: Database.Database): void {
  if (!hasTable(conn, 'leads')) return;

  const existing = getColumnNames(conn, 'leads');
  const maybeAdd = (name: string, typeAndDefault: string) => {
    if (!existing.has(name)) {
      conn.exec(`ALTER TABLE leads ADD COLUMN ${name} ${typeAndDefault}`);
      existing.add(name);
      log.info(`[db] added missing column leads.${name}`);
    }
  };

  // Keep this list aligned with db/schema.ts and db/migrations/0000_init.sql.
  maybeAdd('id', 'TEXT');
  maybeAdd('name', 'TEXT');
  maybeAdd('category', 'TEXT');
  maybeAdd('company_domain', 'TEXT');
  maybeAdd('website', 'TEXT');
  maybeAdd('website_normalized', 'TEXT');
  maybeAdd('phone', 'TEXT');
  maybeAdd('phone_normalized', 'TEXT');
  maybeAdd('email', 'TEXT');
  maybeAdd('address', 'TEXT');
  maybeAdd('city', 'TEXT');
  maybeAdd('country', 'TEXT');
  maybeAdd('latitude', 'REAL');
  maybeAdd('longitude', 'REAL');
  maybeAdd('osm_type', 'TEXT');
  maybeAdd('osm_id', 'TEXT');
  maybeAdd("source", "TEXT NOT NULL DEFAULT 'manual'");
  maybeAdd('source_ref', 'TEXT');
  maybeAdd("status", "TEXT NOT NULL DEFAULT 'new'");
  maybeAdd('notes_count', 'INTEGER NOT NULL DEFAULT 0');
  maybeAdd('score', 'INTEGER NOT NULL DEFAULT 0');
  maybeAdd('raw_tags', 'TEXT');
  maybeAdd("crawl_status", "TEXT DEFAULT 'pending'");
  maybeAdd('crawl_emails', 'TEXT');
  maybeAdd('crawl_phones', 'TEXT');
  maybeAdd('crawl_social', 'TEXT');
  maybeAdd('crawled_at', 'INTEGER');
  maybeAdd('created_at', 'INTEGER');
  maybeAdd('updated_at', 'INTEGER');
  conn.exec('UPDATE leads SET created_at = (unixepoch() * 1000) WHERE created_at IS NULL');
  conn.exec('UPDATE leads SET updated_at = (unixepoch() * 1000) WHERE updated_at IS NULL');
}

function ensureSettingsColumns(conn: Database.Database): void {
  if (!hasTable(conn, 'settings')) return;

  const existing = getColumnNames(conn, 'settings');
  if (!existing.has('updated_at')) {
    conn.exec('ALTER TABLE settings ADD COLUMN updated_at INTEGER');
    log.info('[db] added missing column settings.updated_at');
  }
  conn.exec('UPDATE settings SET updated_at = (unixepoch() * 1000) WHERE updated_at IS NULL');
}

function runMigrations(conn: Database.Database): void {
  rebuildLegacyLeadsTable(conn);
  ensureLeadColumns(conn);
  ensureSettingsColumns(conn);
  const sql = fs.readFileSync(resolveMigrationPath(), 'utf-8');
  conn.exec(sql);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  if (sqlite && db) return;

  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  databasePath = path.join(userData, 'leadforge.db');

  sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('cache_size = -16000'); // 16 MB page cache

  runMigrations(sqlite);
  db = drizzle(sqlite, { schema });

  log.info(`[db] initialized at ${databasePath}`);
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('SQLite not initialized.');
  return sqlite;
}

export function getDatabasePath(): string {
  if (!databasePath) throw new Error('Database path not set.');
  return databasePath;
}

export function closeDatabase(): void {
  sqlite?.close();
  sqlite = null;
  db     = null;
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function safeJson<T = Record<string, unknown>>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ─── Row → domain type mapper ─────────────────────────────────────────────────

export function parseLead(row: schema.Lead): Lead {
  return {
    id:                row.id,
    name:              row.name,
    category:          row.category,
    companyDomain:     row.companyDomain,
    website:           row.website,
    websiteNormalized: row.websiteNormalized,
    phone:             row.phone,
    phoneNormalized:   row.phoneNormalized,
    email:             row.email,
    address:           row.address,
    city:              row.city,
    country:           row.country,
    latitude:          row.latitude,
    longitude:         row.longitude,
    osmType:           row.osmType,
    osmId:             row.osmId,
    source:            row.source as Lead['source'],
    sourceRef:         row.sourceRef,
    status:            row.status as Lead['status'],
    notesCount:        row.notesCount,
    score:             row.score,
    tags:              [],   // populated separately when needed
    rawTags:           safeJson(row.rawTags),
    crawlStatus:       row.crawlStatus as Lead['crawlStatus'],
    crawlEmails:       safeJson<string[]>(row.crawlEmails) ?? [],
    crawlPhones:       safeJson<string[]>(row.crawlPhones) ?? [],
    crawlSocial:       safeJson(row.crawlSocial),
    crawledAt:         row.crawledAt ?? null,
    createdAt:         row.createdAt,
    updatedAt:         row.updatedAt,
  };
}

/** Produce normalized contact fields for insert / update. */
export function normalizedFields(data: { website?: string | null; phone?: string | null }) {
  return {
    websiteNormalized: data.website ? (normalizeWebsite(data.website) ?? null) : null,
    phoneNormalized:   data.phone   ? (normalizePhone(data.phone)     ?? null) : null,
  };
}
