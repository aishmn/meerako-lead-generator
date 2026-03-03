/**
 * IPC Handler Registration
 *
 * All renderer ↔ main-process communication is funnelled through here.
 * PRODUCTION RULE: No mock data. Any handler that uses mock data must call
 * assertDevOnly() first — it throws in packaged builds.
 */

import { app, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import log from 'electron-log/main';
import Papa from 'papaparse';
import { and, asc, count, desc, eq, gt, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../../db/schema';
import { getDatabasePath, getDb, normalizedFields, parseLead } from './db';
import { searchOsm, OSM_CATEGORIES } from './services/osm-service';
import { enqueueJob, enqueueCrawlIfNeeded, getJobStatus } from './services/job-queue';
import { deduplicateBatch } from './services/deduplication';
import { computeLeadScore } from './services/lead-score';
import type { Lead, LeadListParams, OsmSearchRequest, AppSettings } from '../lib/types';

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  general: { appName: 'Meerako Lead Generator', theme: 'dark' },
};

async function getSettings(): Promise<AppSettings> {
  const db  = getDb();
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, 'app_settings')).get();
  if (!row) return DEFAULT_SETTINGS;
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } as AppSettings; }
  catch { return DEFAULT_SETTINGS; }
}

async function saveSettings(settings: AppSettings): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.settings)
    .values({ key: 'app_settings', value: JSON.stringify(settings) })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(settings), updatedAt: Date.now() } })
    .run();
}

// ─── Lead list helper ─────────────────────────────────────────────────────────

async function listLeads(params: LeadListParams = {}) {
  const db = getDb();
  const {
    page = 1, pageSize = 50, search = '', status = '',
    category = '', city = '', source = '',
    hasWebsite, hasPhone, hasEmail, noWebsite, minScore,
    sortBy = 'score', sortDir = 'desc',
  } = params;

  const conditions = [];
  if (search)     conditions.push(or(like(schema.leads.name, `%${search}%`), like(schema.leads.city, `%${search}%`), like(schema.leads.phone, `%${search}%`), like(schema.leads.email, `%${search}%`), like(schema.leads.website, `%${search}%`)));
  if (status)     conditions.push(eq(schema.leads.status, status));
  if (category)   conditions.push(eq(schema.leads.category, category));
  if (city)       conditions.push(like(schema.leads.city, `%${city}%`));
  if (source)     conditions.push(eq(schema.leads.source, source));
  if (hasWebsite) conditions.push(isNotNull(schema.leads.website));
  if (hasPhone)   conditions.push(isNotNull(schema.leads.phoneNormalized));
  if (hasEmail)   conditions.push(isNotNull(schema.leads.email));
  if (noWebsite)  conditions.push(isNull(schema.leads.website));
  if (minScore)   conditions.push(sql`${schema.leads.score} >= ${minScore}`);

  const where    = conditions.length ? and(...conditions) : undefined;
  const orderCol = {
    name:      schema.leads.name,
    createdAt: schema.leads.createdAt,
    updatedAt: schema.leads.updatedAt,
    status:    schema.leads.status,
    score:     schema.leads.score,
  }[sortBy] ?? schema.leads.score;
  const orderFn  = sortDir === 'asc' ? asc : desc;

  const [{ total }] = await db.select({ total: count() }).from(schema.leads).where(where);
  const rows        = await db.select().from(schema.leads).where(where).orderBy(orderFn(orderCol)).limit(pageSize).offset((page - 1) * pageSize);

  return { leads: rows.map(parseLead), total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function leadsTocsv(leads: Lead[]): string {
  return Papa.unparse(leads.map((l) => ({
    id: l.id, name: l.name, category: l.category ?? '', status: l.status, source: l.source,
    website: l.website ?? '', phone: l.phone ?? '', email: l.email ?? '',
    address: l.address ?? '', city: l.city ?? '', country: l.country ?? '',
    latitude: l.latitude ?? '', longitude: l.longitude ?? '',
    osm_type: l.osmType ?? '', osm_id: l.osmId ?? '',
    created_at: new Date(l.createdAt).toISOString(),
  })));
}

// ─── Register all handlers ────────────────────────────────────────────────────

export async function registerIpcHandlers(_win: BrowserWindow): Promise<void> {

  // App
  ipcMain.handle('app:getVersion', () => app.getVersion());

  // Dashboard
  ipcMain.handle('dashboard:getMetrics', async () => {
    const db = getDb();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const [
      [{ total }], [{ newThisWeek }], [{ withWebsite }], [{ noWebsite }], [{ withPhone }], [{ hotProspects }], [{ pendingCrawls }],
      byStatusRows, topCatRows, recentEventRows,
    ] = await Promise.all([
      db.select({ total: count() }).from(schema.leads),
      db.select({ newThisWeek: count() }).from(schema.leads).where(gt(schema.leads.createdAt, weekAgo)),
      db.select({ withWebsite: count() }).from(schema.leads).where(isNotNull(schema.leads.website)),
      db.select({ noWebsite:   count() }).from(schema.leads).where(isNull(schema.leads.website)),
      db.select({ withPhone:   count() }).from(schema.leads).where(isNotNull(schema.leads.phoneNormalized)),
      // Hot prospects = no website + has phone (prime targets for Meerako)
      db.select({ hotProspects: count() }).from(schema.leads).where(and(isNull(schema.leads.website), isNotNull(schema.leads.phoneNormalized))),
      db.select({ pendingCrawls: count() }).from(schema.leads).where(eq(schema.leads.crawlStatus, 'pending')),
      db.select({ status: schema.leads.status, cnt: count() }).from(schema.leads).groupBy(schema.leads.status),
      db.select({ category: schema.leads.category, cnt: count() }).from(schema.leads).where(isNotNull(schema.leads.category)).groupBy(schema.leads.category).orderBy(desc(count())).limit(8),
      db.select().from(schema.leadEvents).orderBy(desc(schema.leadEvents.createdAt)).limit(10),
    ]);
    const byStatus: Record<string, number> = {};
    for (const r of byStatusRows) byStatus[r.status] = r.cnt;
    return {
      totalLeads: total, newThisWeek, withWebsite, noWebsite, withPhone, hotProspects, pendingCrawls, byStatus,
      topCategories: topCatRows.map((r) => ({ category: r.category!, count: r.cnt })),
      recentEvents:  recentEventRows.map((r) => ({ id: r.id, leadId: r.leadId, eventType: r.eventType, payload: r.payload ? JSON.parse(r.payload) : null, createdAt: r.createdAt })),
    };
  });

  // Leads — CRUD
  ipcMain.handle('leads:list',   async (_e, p: LeadListParams) => listLeads(p));
  ipcMain.handle('leads:getById', async (_e, id: string) => {
    const db  = getDb();
    const row = await db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
    return row ? parseLead(row) : null;
  });

  ipcMain.handle('leads:create', async (_e, payload: Partial<Lead>) => {
    const db = getDb(); const id = nanoid(); const now = Date.now();
    const norm  = normalizedFields({ website: payload.website ?? null, phone: payload.phone ?? null });
    const score = computeLeadScore({ website: payload.website, phone: payload.phone, email: payload.email, category: payload.category });
    await db.insert(schema.leads).values({
      id, name: payload.name ?? 'Unnamed', category: payload.category ?? null,
      website: payload.website ?? null, websiteNormalized: norm.websiteNormalized,
      phone: payload.phone ?? null, phoneNormalized: norm.phoneNormalized,
      email: payload.email ?? null, address: payload.address ?? null,
      city: payload.city ?? null, country: payload.country ?? null,
      latitude: payload.latitude ?? null, longitude: payload.longitude ?? null,
      source: 'manual', status: payload.status ?? 'new', score,
      crawlStatus: payload.website ? 'pending' : 'skipped', createdAt: now, updatedAt: now,
    }).run();
    await db.insert(schema.leadEvents).values({ id: nanoid(), leadId: id, eventType: 'created', payload: JSON.stringify({ source: 'manual' }) }).run();
    if (payload.website) await enqueueCrawlIfNeeded(id);
    return parseLead((await db.select().from(schema.leads).where(eq(schema.leads.id, id)).get())!);
  });

  ipcMain.handle('leads:update', async (_e, id: string, payload: Partial<Lead>) => {
    const db = getDb(); const now = Date.now();
    const norm = normalizedFields({ website: payload.website ?? null, phone: payload.phone ?? null });
    const set: Record<string, unknown> = { updatedAt: now };
    if (payload.name     !== undefined) set.name     = payload.name;
    if (payload.category !== undefined) set.category = payload.category;
    if (payload.website  !== undefined) { set.website = payload.website; set.websiteNormalized = norm.websiteNormalized; }
    if (payload.phone    !== undefined) { set.phone   = payload.phone;   set.phoneNormalized   = norm.phoneNormalized; }
    if (payload.email    !== undefined) set.email   = payload.email;
    if (payload.address  !== undefined) set.address = payload.address;
    if (payload.city     !== undefined) set.city    = payload.city;
    if (payload.country  !== undefined) set.country = payload.country;
    if (payload.status   !== undefined) set.status  = payload.status;
    // Recompute score when contact-relevant fields change
    const contactChanged = payload.website !== undefined || payload.phone !== undefined || payload.email !== undefined || payload.category !== undefined;
    if (contactChanged) {
      const existing = await db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
      if (existing) {
        set.score = computeLeadScore({
          website:  payload.website  !== undefined ? payload.website  : existing.website,
          phone:    payload.phone    !== undefined ? payload.phone    : existing.phone,
          email:    payload.email    !== undefined ? payload.email    : existing.email,
          category: payload.category !== undefined ? payload.category : existing.category,
        });
      }
    }
    await db.update(schema.leads).set(set).where(eq(schema.leads.id, id)).run();
    if (payload.status !== undefined) {
      await db.insert(schema.leadEvents).values({ id: nanoid(), leadId: id, eventType: 'status_change', payload: JSON.stringify({ status: payload.status }) }).run();
    }
    return parseLead((await db.select().from(schema.leads).where(eq(schema.leads.id, id)).get())!);
  });

  ipcMain.handle('leads:deleteMany', async (_e, ids: string[]) => {
    if (!ids.length) return 0;
    const db = getDb();
    for (const id of ids) await db.delete(schema.leads).where(eq(schema.leads.id, id)).run();
    return ids.length;
  });

  ipcMain.handle('leads:bulkStatus', async (_e, ids: string[], status: Lead['status']) => {
    const db = getDb(); const now = Date.now();
    for (const id of ids) {
      await db.update(schema.leads).set({ status, updatedAt: now }).where(eq(schema.leads.id, id)).run();
      await db.insert(schema.leadEvents).values({ id: nanoid(), leadId: id, eventType: 'status_change', payload: JSON.stringify({ status }) }).run();
    }
    return ids.length;
  });

  ipcMain.handle('leads:searchGlobal', async (_e, query: string) => {
    if (!query.trim()) return [];
    const db = getDb(); const pat = `%${query}%`;
    const rows = await db.select().from(schema.leads).where(or(like(schema.leads.name, pat), like(schema.leads.city, pat), like(schema.leads.phone, pat), like(schema.leads.email, pat), like(schema.leads.website, pat))).limit(20);
    return rows.map(parseLead);
  });

  ipcMain.handle('leads:exportCsv', async (_e, ids?: string[]) => {
    const db = getDb();
    let rows: schema.Lead[];
    if (ids?.length) {
      rows = [];
      for (const id of ids) {
        const r = await db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
        if (r) rows.push(r);
      }
    } else {
      rows = await db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).all();
    }
    return leadsTocsv(rows.map(parseLead));
  });

  ipcMain.handle('leads:importCsv', async (_e, rows: Record<string, string>[]) => {
    const db = getDb(); const now = Date.now();
    let inserted = 0, duplicates = 0, errors = 0;
    const incoming = rows.map((r) => ({
      website: r.website || r.Website || null,
      phone:   r.phone   || r.Phone   || null,
      name:    r.name    || r.Name    || r.business_name || r['Business Name'] || null,
    }));
    const { toInsert, duplicates: dupes } = await deduplicateBatch(incoming);
    duplicates = dupes.length;
    for (let i = 0; i < toInsert.length; i++) {
      const raw = toInsert[i]; const r = rows[i];
      try {
        const id       = nanoid();
        const category = r.category || r.Category || null;
        const email    = r.email || r.Email || null;
        const norm     = normalizedFields({ website: raw.website ?? null, phone: raw.phone ?? null });
        const score    = computeLeadScore({ website: raw.website, phone: raw.phone, email, category });
        await db.insert(schema.leads).values({
          id, name: raw.name ?? r.name ?? r.Name ?? 'Unnamed',
          category,
          website: raw.website, websiteNormalized: norm.websiteNormalized,
          phone: raw.phone, phoneNormalized: norm.phoneNormalized,
          email, address: r.address || r.Address || null,
          city: r.city || r.City || null, country: r.country || r.Country || null,
          source: 'csv_import', status: 'new', score,
          crawlStatus: raw.website ? 'pending' : 'skipped', createdAt: now, updatedAt: now,
        }).run();
        await db.insert(schema.leadEvents).values({ id: nanoid(), leadId: id, eventType: 'imported', payload: JSON.stringify({ source: 'csv_import' }) }).run();
        if (raw.website) await enqueueCrawlIfNeeded(id);
        inserted++;
      } catch (err) { log.error('[ipc] csv import row error', err); errors++; }
    }
    return { inserted, duplicates, errors };
  });

  // Notes
  ipcMain.handle('notes:list', async (_e, leadId: string) => {
    const db = getDb();
    return db.select().from(schema.leadNotes).where(eq(schema.leadNotes.leadId, leadId)).orderBy(asc(schema.leadNotes.createdAt));
  });

  ipcMain.handle('notes:add', async (_e, leadId: string, content: string) => {
    const db = getDb(); const id = nanoid(); const now = Date.now();
    await db.insert(schema.leadNotes).values({ id, leadId, content, createdAt: now }).run();
    await db.update(schema.leads).set({ notesCount: sql`${schema.leads.notesCount} + 1`, updatedAt: now }).where(eq(schema.leads.id, leadId)).run();
    await db.insert(schema.leadEvents).values({ id: nanoid(), leadId, eventType: 'note_added', payload: JSON.stringify({ noteId: id }) }).run();
    return db.select().from(schema.leadNotes).where(eq(schema.leadNotes.id, id)).get();
  });

  ipcMain.handle('notes:remove', async (_e, noteId: string) => {
    const db = getDb();
    const note = await db.select().from(schema.leadNotes).where(eq(schema.leadNotes.id, noteId)).get();
    if (!note) return;
    await db.delete(schema.leadNotes).where(eq(schema.leadNotes.id, noteId)).run();
    await db.update(schema.leads).set({ notesCount: sql`MAX(0, ${schema.leads.notesCount} - 1)`, updatedAt: Date.now() }).where(eq(schema.leads.id, note.leadId)).run();
  });

  // Events
  ipcMain.handle('events:list', async (_e, leadId: string) => {
    const db = getDb();
    const rows = await db.select().from(schema.leadEvents).where(eq(schema.leadEvents.leadId, leadId)).orderBy(desc(schema.leadEvents.createdAt)).limit(50);
    return rows.map((r) => ({ id: r.id, leadId: r.leadId, eventType: r.eventType, payload: r.payload ? JSON.parse(r.payload) : null, createdAt: r.createdAt }));
  });

  // OSM
  ipcMain.handle('osm:categories', () => Object.keys(OSM_CATEGORIES));

  ipcMain.handle('osm:search', async (_e, params: OsmSearchRequest) => {
    if (!params.location?.trim())  throw new Error('Location is required');
    if (!params.categories?.length) throw new Error('At least one category is required');
    const jobId = await enqueueJob('osm_query', params);
    try {
      const result = await searchOsm(params);
      return { ...result, jobId };
    } catch (err) {
      log.error('[ipc] osm:search error', err);
      throw err;
    }
  });

  // Jobs
  ipcMain.handle('jobs:list', async () => {
    const db = getDb();
    const rows = await db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt)).limit(50);
    return rows.map((r) => ({ id: r.id, type: r.type, status: r.status, attempts: r.attempts, maxAttempts: r.maxAttempts, error: r.error, createdAt: r.createdAt, completedAt: r.completedAt ?? null }));
  });

  ipcMain.handle('jobs:getById', async (_e, id: string) => {
    const job = await getJobStatus(id);
    if (!job) return null;
    return { id: job.id, type: job.type, status: job.status, attempts: job.attempts, maxAttempts: job.maxAttempts, error: job.error, createdAt: job.createdAt, completedAt: job.completedAt ?? null };
  });

  ipcMain.handle('jobs:cancel', async (_e, id: string) => {
    const db = getDb();
    await db.update(schema.jobs).set({ status: 'failed', error: 'Cancelled by user', completedAt: Date.now() }).where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, 'pending'))).run();
  });

  // Tags
  ipcMain.handle('tags:list', async () => {
    const db = getDb();
    return db.select().from(schema.tags).orderBy(asc(schema.tags.name)).all();
  });

  ipcMain.handle('tags:listForLead', async (_e, leadId: string) => {
    const db = getDb();
    const rows = await db
      .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
      .from(schema.leadTags)
      .innerJoin(schema.tags, eq(schema.leadTags.tagId, schema.tags.id))
      .where(eq(schema.leadTags.leadId, leadId))
      .all();
    return rows;
  });

  ipcMain.handle('tags:addToLead', async (_e, leadId: string, tagId: string) => {
    const db = getDb();
    await db.insert(schema.leadTags).values({ leadId, tagId }).onConflictDoNothing().run();
  });

  ipcMain.handle('tags:removeFromLead', async (_e, leadId: string, tagId: string) => {
    const db = getDb();
    await db.delete(schema.leadTags)
      .where(and(eq(schema.leadTags.leadId, leadId), eq(schema.leadTags.tagId, tagId)))
      .run();
  });

  // Settings
  ipcMain.handle('settings:get',    () => getSettings());
  ipcMain.handle('settings:update', async (_e, p: Partial<AppSettings>) => {
    const current = await getSettings();
    const updated: AppSettings = { general: { ...current.general, ...(p.general ?? {}) } };
    await saveSettings(updated);
    return updated;
  });

  log.info('[ipc] all handlers registered');
}
