import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Leads ────────────────────────────────────────────────────────────────────
// Core entity. Represents a discovered business location.
export const leads = sqliteTable(
  'leads',
  {
    id: text('id').primaryKey(),

    // Business identity
    name:          text('name').notNull(),
    category:      text('category'),
    companyDomain: text('company_domain'),

    // Contact
    website:           text('website'),
    websiteNormalized: text('website_normalized'),
    phone:             text('phone'),
    phoneNormalized:   text('phone_normalized'),
    email:             text('email'),

    // Location
    address:   text('address'),
    city:      text('city'),
    country:   text('country'),
    latitude:  real('latitude'),
    longitude: real('longitude'),

    // OSM provenance — primary dedup key for OSM-sourced leads
    osmType: text('osm_type'),   // 'node' | 'way' | 'relation'
    osmId:   text('osm_id'),

    // Source tracking
    source:    text('source').notNull().default('manual'),  // 'osm' | 'csv_import' | 'manual'
    sourceRef: text('source_ref'),

    // Workflow
    status:     text('status').notNull().default('new'),    // 'new' | 'contacted' | 'interested' | 'rejected' | 'closed'
    notesCount: integer('notes_count').notNull().default(0),
    score:      integer('score').notNull().default(0),      // 0-100 agency prospect score

    // Raw OSM tags
    rawTags: text('raw_tags'),   // JSON object

    // Website crawl enrichment
    crawlStatus: text('crawl_status').default('pending'), // 'pending' | 'crawling' | 'done' | 'failed' | 'skipped'
    crawlEmails: text('crawl_emails'),                    // JSON string[]
    crawlPhones: text('crawl_phones'),                    // JSON string[]
    crawlSocial: text('crawl_social'),                    // JSON { facebook, twitter, linkedin, instagram }
    crawledAt:   integer('crawled_at'),                   // unix ms

    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniqOsm:          uniqueIndex('uniq_osm').on(t.osmType, t.osmId),
    idxStatus:        index('idx_leads_status').on(t.status),
    idxCategory:      index('idx_leads_category').on(t.category),
    idxCity:          index('idx_leads_city').on(t.city),
    idxCountry:       index('idx_leads_country').on(t.country),
    idxSource:        index('idx_leads_source').on(t.source),
    idxCreated:       index('idx_leads_created').on(t.createdAt),
    idxWebsiteNorm:   index('idx_leads_website_norm').on(t.websiteNormalized),
    idxPhoneNorm:     index('idx_leads_phone_norm').on(t.phoneNormalized),
    idxCrawlStatus:   index('idx_leads_crawl_status').on(t.crawlStatus),
  })
);

// ─── Lead Notes ───────────────────────────────────────────────────────────────
export const leadNotes = sqliteTable(
  'lead_notes',
  {
    id:        text('id').primaryKey(),
    leadId:    text('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    content:   text('content').notNull(),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({ idxLead: index('idx_notes_lead').on(t.leadId) })
);

// ─── Lead Events (Audit Trail) ────────────────────────────────────────────────
export const leadEvents = sqliteTable(
  'lead_events',
  {
    id:        text('id').primaryKey(),
    leadId:    text('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(), // 'created' | 'status_change' | 'note_added' | 'enriched' | 'imported'
    payload:   text('payload'),              // JSON
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    idxLead:    index('idx_events_lead').on(t.leadId),
    idxType:    index('idx_events_type').on(t.eventType),
    idxCreated: index('idx_events_created').on(t.createdAt),
  })
);

// ─── Tags ─────────────────────────────────────────────────────────────────────
export const tags = sqliteTable('tags', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull().unique(),
  color:     text('color').default('#6b7280'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const leadTags = sqliteTable(
  'lead_tags',
  {
    leadId: text('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    tagId:  text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({ uniqLeadTag: uniqueIndex('uniq_lead_tag').on(t.leadId, t.tagId) })
);

// ─── Background Job Queue ──────────────────────────────────────────────────────
export const jobs = sqliteTable(
  'jobs',
  {
    id:          text('id').primaryKey(),
    type:        text('type').notNull(),      // 'osm_query' | 'website_crawl'
    status:      text('status').notNull().default('pending'), // 'pending' | 'running' | 'done' | 'failed'
    payload:     text('payload').notNull(),   // JSON
    result:      text('result'),              // JSON
    error:       text('error'),
    attempts:    integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    scheduledAt: integer('scheduled_at').notNull().default(sql`(unixepoch() * 1000)`),
    startedAt:   integer('started_at'),
    completedAt: integer('completed_at'),
    createdAt:   integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    idxStatus:      index('idx_jobs_status').on(t.status),
    idxType:        index('idx_jobs_type').on(t.type),
    idxStatusSched: index('idx_jobs_status_sched').on(t.status, t.scheduledAt),
  })
);

// ─── Geocode Cache (Permanent) ────────────────────────────────────────────────
export const geocodeCache = sqliteTable('geocode_cache', {
  id:        text('id').primaryKey(),
  query:     text('query').notNull().unique(),  // normalized query string
  result:    text('result').notNull(),           // JSON: { bbox, center, displayName }
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── OSM Query Cache (24 h TTL) ────────────────────────────────────────────────
export const osmQueryCache = sqliteTable(
  'osm_query_cache',
  {
    id:          text('id').primaryKey(),
    queryHash:   text('query_hash').notNull().unique(),
    queryParams: text('query_params').notNull(), // JSON: original search params
    resultCount: integer('result_count').notNull().default(0),
    expiresAt:   integer('expires_at').notNull(), // unix ms
    createdAt:   integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({ idxExpires: index('idx_osm_cache_expires').on(t.expiresAt) })
);

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key:       text('key').primaryKey(),
  value:     text('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────
export type Lead       = typeof leads.$inferSelect;
export type NewLead    = typeof leads.$inferInsert;
export type LeadNote   = typeof leadNotes.$inferSelect;
export type LeadEvent  = typeof leadEvents.$inferSelect;
export type Tag        = typeof tags.$inferSelect;
export type Job        = typeof jobs.$inferSelect;
export type NewJob     = typeof jobs.$inferInsert;
export type GeocodeRow = typeof geocodeCache.$inferSelect;
