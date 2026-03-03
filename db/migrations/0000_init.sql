-- Meerako Lead Generator — Initial Schema
-- SQLite only. No PostgreSQL-specific syntax.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Leads ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                 TEXT    PRIMARY KEY NOT NULL,
  name               TEXT    NOT NULL,
  category           TEXT,
  company_domain     TEXT,

  -- Contact
  website            TEXT,
  website_normalized TEXT,
  phone              TEXT,
  phone_normalized   TEXT,
  email              TEXT,

  -- Location
  address            TEXT,
  city               TEXT,
  country            TEXT,
  latitude           REAL,
  longitude          REAL,

  -- OSM provenance
  osm_type           TEXT,
  osm_id             TEXT,

  -- Source
  source             TEXT    NOT NULL DEFAULT 'manual',
  source_ref         TEXT,

  -- Workflow
  status             TEXT    NOT NULL DEFAULT 'new',
  notes_count        INTEGER NOT NULL DEFAULT 0,
  score              INTEGER NOT NULL DEFAULT 0,
  raw_tags           TEXT,

  -- Crawl enrichment
  crawl_status       TEXT    DEFAULT 'pending',
  crawl_emails       TEXT,
  crawl_phones       TEXT,
  crawl_social       TEXT,
  crawled_at         INTEGER,

  created_at         INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Prevent duplicate OSM objects. NULL values are excluded from UNIQUE constraints.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_osm         ON leads(osm_type, osm_id)    WHERE osm_type IS NOT NULL AND osm_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_website     ON leads(website_normalized)  WHERE website_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_status        ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_category      ON leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_city          ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_country       ON leads(country);
CREATE INDEX IF NOT EXISTS idx_leads_source        ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created       ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_phone_norm    ON leads(phone_normalized)    WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_crawl_status  ON leads(crawl_status);

-- ─── Lead Notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_notes (
  id         TEXT    PRIMARY KEY NOT NULL,
  lead_id    TEXT    NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON lead_notes(lead_id);

-- ─── Lead Events (Audit Trail) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_events (
  id         TEXT    PRIMARY KEY NOT NULL,
  lead_id    TEXT    NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT    NOT NULL,
  payload    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_events_lead    ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_type    ON lead_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON lead_events(created_at);

-- ─── Tags ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id         TEXT    PRIMARY KEY NOT NULL,
  name       TEXT    NOT NULL UNIQUE,
  color      TEXT    DEFAULT '#6b7280',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

-- ─── Job Queue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT    PRIMARY KEY NOT NULL,
  type         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending',
  payload      TEXT    NOT NULL,
  result       TEXT,
  error        TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  started_at   INTEGER,
  completed_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_jobs_status       ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type         ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_status_sched ON jobs(status, scheduled_at);

-- ─── Geocode Cache (Permanent) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geocode_cache (
  id         TEXT    PRIMARY KEY NOT NULL,
  query      TEXT    NOT NULL UNIQUE,
  result     TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- ─── OSM Query Cache (24 h TTL) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS osm_query_cache (
  id           TEXT    PRIMARY KEY NOT NULL,
  query_hash   TEXT    NOT NULL UNIQUE,
  query_params TEXT    NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_osm_cache_expires ON osm_query_cache(expires_at);

-- ─── Settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT    PRIMARY KEY NOT NULL,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- ─── Agency seed tags ─────────────────────────────────────────────────────────
-- Pre-load useful tags for a software/web agency workflow.
INSERT OR IGNORE INTO tags (id, name, color) VALUES
  ('tag_needs_website',   'needs-website',   '#f97316'),
  ('tag_needs_redesign',  'needs-redesign',  '#eab308'),
  ('tag_needs_seo',       'needs-seo',       '#8b5cf6'),
  ('tag_needs_app',       'needs-app',       '#3b82f6'),
  ('tag_hot',             'hot',             '#ef4444'),
  ('tag_follow_up',       'follow-up',       '#10b981'),
  ('tag_pitched',         'pitched',         '#6b7280'),
  ('tag_no_response',     'no-response',     '#94a3b8');
