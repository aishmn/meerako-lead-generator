/**
 * OpenStreetMap / Overpass API Service
 *
 * Discovers businesses by category + location using the free Overpass API.
 * All results are deduplicated and cached for 24 hours.
 *
 * Dedup keys (in priority order):
 *   1. osm_type + osm_id  (guaranteed unique per OSM)
 *   2. website_normalized
 *   3. phone_normalized
 */

import crypto from 'node:crypto';
import log from 'electron-log/main';
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../../../db/schema';
import { getDb } from '../db';
import { geocodeLocation, type BoundingBox } from './nominatim-service';
import { normalizePhone } from './phone-service';
import { normalizeWebsite } from './crawler-service';
import { computeLeadScore } from './lead-score';

// ─── Overpass endpoints (rotated for reliability) ─────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'Meerako Lead Generator/1.0 (internal-lead-discovery-tool)';
const CACHE_TTL  = 24 * 60 * 60 * 1000; // 24 h in ms
const TIMEOUT    = 60;                   // Overpass query timeout (seconds)
const MAX_RETRIES = 5;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504, 522, 524]);

// ─── OSM → category mapping ───────────────────────────────────────────────────
// Each entry maps a user-friendly category to one or more OSM tag filters.
export const OSM_CATEGORIES: Record<string, OsmTagFilter[]> = {
  restaurant:   [{ key: 'amenity', value: 'restaurant' }],
  cafe:         [{ key: 'amenity', value: 'cafe' }],
  bar:          [{ key: 'amenity', value: 'bar' }],
  fast_food:    [{ key: 'amenity', value: 'fast_food' }],
  clinic:       [{ key: 'amenity', value: 'clinic' }, { key: 'amenity', value: 'doctors' }],
  hospital:     [{ key: 'amenity', value: 'hospital' }],
  pharmacy:     [{ key: 'amenity', value: 'pharmacy' }],
  dentist:      [{ key: 'amenity', value: 'dentist' }],
  gym:          [{ key: 'leisure', value: 'fitness_centre' }],
  hotel:        [{ key: 'tourism', value: 'hotel' }, { key: 'tourism', value: 'guest_house' }],
  shop:         [{ key: 'shop', value: '*' }],
  supermarket:  [{ key: 'shop', value: 'supermarket' }],
  bank:         [{ key: 'amenity', value: 'bank' }],
  school:       [{ key: 'amenity', value: 'school' }],
  university:   [{ key: 'amenity', value: 'university' }],
  beauty_salon: [{ key: 'shop', value: 'beauty' }, { key: 'shop', value: 'hairdresser' }],
  car_repair:   [{ key: 'shop', value: 'car_repair' }],
  laundry:      [{ key: 'shop', value: 'laundry' }, { key: 'shop', value: 'dry_cleaning' }],
  lawyer:       [{ key: 'office', value: 'lawyer' }],
  accountant:   [{ key: 'office', value: 'accountant' }],
  it_company:   [{ key: 'office', value: 'it' }],
  real_estate:  [{ key: 'office', value: 'estate_agent' }],
};

export interface OsmTagFilter {
  key:   string;
  value: string; // '*' means any value
}

export interface OsmSearchParams {
  location:     string;   // city/place name resolved via Nominatim
  bbox?:        BoundingBox;
  radiusMeters?: number;  // used when bbox is not provided
  categories:   string[]; // keys from OSM_CATEGORIES
  limit?:       number;
}

export interface OsmBusiness {
  osmType:  'node' | 'way' | 'relation';
  osmId:    string;
  name:     string;
  category: string;
  tags:     Record<string, string>;
  lat:      number | null;
  lon:      number | null;
  address:  string;
  phone:    string | null;
  website:  string | null;
  email:    string | null;
}

// ─── Query builder ────────────────────────────────────────────────────────────

function buildFilter(tagFilter: OsmTagFilter): string {
  if (tagFilter.value === '*') return `["${tagFilter.key}"]`;
  return `["${tagFilter.key}"="${tagFilter.value}"]`;
}

/**
 * Build Overpass QL for a bounding-box search.
 * We query node + way (relations rarely have contact info).
 */
export function buildOverpassQuery(bbox: BoundingBox, tagFilters: OsmTagFilter[]): string {
  const { south, west, north, east } = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  const lines: string[] = [];
  for (const filter of tagFilters) {
    const f = buildFilter(filter);
    lines.push(`  node${f}(${bboxStr});`);
    lines.push(`  way${f}(${bboxStr});`);
  }

  return [
    `[out:json][timeout:${TIMEOUT}];`,
    '(',
    ...lines,
    ');',
    'out body center qt 500;', // 'center' gives centroid for ways
  ].join('\n');
}

/**
 * Build Overpass QL for a radius search around a lat/lon point.
 */
export function buildRadiusQuery(
  lat: number,
  lon: number,
  radiusMeters: number,
  tagFilters: OsmTagFilter[]
): string {
  const around = `around:${radiusMeters},${lat},${lon}`;
  const lines: string[] = [];
  for (const filter of tagFilters) {
    const f = buildFilter(filter);
    lines.push(`  node${f}(${around});`);
    lines.push(`  way${f}(${around});`);
  }
  return [
    `[out:json][timeout:${TIMEOUT}];`,
    '(',
    ...lines,
    ');',
    'out body center qt 500;',
  ].join('\n');
}

// ─── HTTP with retry ──────────────────────────────────────────────────────────

async function fetchOverpass(query: string, attempt = 0): Promise<unknown> {
  const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
  const retryWithBackoff = async (reason: string): Promise<unknown> => {
    if (attempt < MAX_RETRIES) {
      const base = Math.min(1000 * 2 ** attempt, 30_000);
      const jitter = Math.floor(Math.random() * 250);
      const wait = base + jitter;
      log.warn(`[overpass] ${reason} from ${endpoint}, retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise<void>((r) => setTimeout(r, wait));
      return fetchOverpass(query, attempt + 1);
    }
    throw new Error(`${reason} after ${MAX_RETRIES} retries`);
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (RETRYABLE_STATUS.has(res.status)) {
      return retryWithBackoff(`HTTP ${res.status}`);
    }

    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

    const bodyText = await res.text();
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();

    // Overpass can intermittently return XML/HTML error pages even on 200.
    if (!contentType.includes('application/json')) {
      const snippet = bodyText.slice(0, 120).replace(/\s+/g, ' ').trim();
      if (bodyText.trim().startsWith('<') || contentType.includes('xml') || contentType.includes('html')) {
        return retryWithBackoff(`non-JSON Overpass response (${contentType || 'unknown content-type'}): ${snippet || '<empty>'}`);
      }
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      const snippet = bodyText.slice(0, 120).replace(/\s+/g, ' ').trim();
      return retryWithBackoff(`invalid JSON from Overpass: ${snippet || '<empty>'}`);
    }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const base = Math.min(1000 * 2 ** attempt, 30_000);
      const jitter = Math.floor(Math.random() * 250);
      const wait = base + jitter;
      log.warn(`[overpass] request failed (${endpoint}), retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`, err);
      await new Promise<void>((r) => setTimeout(r, wait));
      return fetchOverpass(query, attempt + 1);
    }
    throw err;
  }
}

// ─── Result parsing ───────────────────────────────────────────────────────────

function extractAddress(tags: Record<string, string>): string {
  const parts: string[] = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street'])      parts.push(tags['addr:street']);
  if (tags['addr:city'])        parts.push(tags['addr:city']);
  if (tags['addr:postcode'])    parts.push(tags['addr:postcode']);
  return parts.join(', ');
}

function parseElements(elements: unknown[], category: string): OsmBusiness[] {
  const results: OsmBusiness[] = [];

  for (const el of elements) {
    const e = el as {
      type: string;
      id:   number;
      tags?: Record<string, string>;
      lat?:  number;
      lon?:  number;
      center?: { lat: number; lon: number };
    };

    const tags = e.tags ?? {};
    const name = tags.name;
    if (!name) continue; // skip unnamed objects

    const lat = e.lat ?? e.center?.lat ?? null;
    const lon = e.lon ?? e.center?.lon ?? null;

    results.push({
      osmType:  e.type as 'node' | 'way' | 'relation',
      osmId:    String(e.id),
      name,
      category,
      tags,
      lat,
      lon,
      address: extractAddress(tags),
      phone:   tags.phone || tags['contact:phone'] || null,
      website: tags.website || tags['contact:website'] || null,
      email:   tags.email || tags['contact:email'] || null,
    });
  }

  return results;
}

// ─── Deduplication check ──────────────────────────────────────────────────────

async function isDuplicate(business: OsmBusiness): Promise<boolean> {
  const db = getDb();

  // 1. OSM identity (most reliable)
  const byOsm = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.osmType, business.osmType),
        eq(schema.leads.osmId, business.osmId)
      )
    )
    .get();
  if (byOsm) return true;

  // 2. Normalized website
  if (business.website) {
    const norm = normalizeWebsite(business.website);
    if (norm) {
      const byWebsite = await db
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(eq(schema.leads.websiteNormalized, norm))
        .get();
      if (byWebsite) return true;
    }
  }

  // 3. Normalized phone
  if (business.phone) {
    const norm = normalizePhone(business.phone);
    if (norm) {
      const byPhone = await db
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(eq(schema.leads.phoneNormalized, norm))
        .get();
      if (byPhone) return true;
    }
  }

  return false;
}

// ─── Query cache ──────────────────────────────────────────────────────────────

function paramHash(params: OsmSearchParams): string {
  const normalized = JSON.stringify({
    location:    params.location?.toLowerCase().trim(),
    categories:  [...params.categories].sort(),
    radiusMeters: params.radiusMeters ?? null,
    bbox:        params.bbox ?? null,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

async function checkQueryCache(hash: string): Promise<boolean> {
  const db  = getDb();
  const now = Date.now();
  const row = await db
    .select()
    .from(schema.osmQueryCache)
    .where(eq(schema.osmQueryCache.queryHash, hash))
    .get();

  if (row && row.expiresAt > now) {
    log.info(`[overpass] query cache hit (${row.resultCount} results, expires in ${Math.round((row.expiresAt - now) / 60000)} min)`);
    return true;
  }
  return false;
}

async function writeQueryCache(hash: string, params: OsmSearchParams, count: number): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.osmQueryCache)
    .values({
      id:          nanoid(),
      queryHash:   hash,
      queryParams: JSON.stringify(params),
      resultCount: count,
      expiresAt:   Date.now() + CACHE_TTL,
    })
    .onConflictDoUpdate({
      target: schema.osmQueryCache.queryHash,
      set:    { resultCount: count, expiresAt: Date.now() + CACHE_TTL },
    })
    .run();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchOsm(params: OsmSearchParams): Promise<{
  inserted:  number;
  skipped:   number;
  total:     number;
  cached:    boolean;
}> {
  const hash = paramHash(params);

  // Cache check
  if (await checkQueryCache(hash)) {
    return { inserted: 0, skipped: 0, total: 0, cached: true };
  }

  // Resolve bounding box
  let bbox = params.bbox;
  let center: { lat: number; lon: number } | null = null;

  if (!bbox) {
    const geo = await geocodeLocation(params.location);
    if (!geo) throw new Error(`Could not geocode location: "${params.location}"`);
    bbox   = geo.bbox;
    center = geo.center;
  }

  // Validate categories early.
  const validCategories: string[] = [];
  for (const cat of params.categories) {
    const filters = OSM_CATEGORIES[cat];
    if (filters) validCategories.push(cat);
    else log.warn(`[overpass] unknown category: "${cat}"`);
  }
  if (validCategories.length === 0) throw new Error('No valid categories provided');

  // Parse and insert
  const db = getDb();
  let inserted = 0;
  let skipped  = 0;
  const failedCategories: string[] = [];

  for (const catName of validCategories) {
    const filters = OSM_CATEGORIES[catName] ?? [];

    const query = params.radiusMeters && center
      ? buildRadiusQuery(center.lat, center.lon, params.radiusMeters, filters)
      : buildOverpassQuery(bbox, filters);

    log.info(`[overpass] executing query for [${catName}] in "${params.location}"`);

    let matching: OsmBusiness[] = [];
    try {
      const data = (await fetchOverpass(query)) as { elements: unknown[] };
      matching = parseElements(data.elements ?? [], catName);
    } catch (err) {
      failedCategories.push(catName);
      log.error(`[overpass] category "${catName}" failed after retries`, err);
      continue;
    }

    for (const biz of matching) {
      if (await isDuplicate(biz)) {
        skipped++;
        continue;
      }

      const websiteNorm = biz.website ? normalizeWebsite(biz.website) : null;
      const phoneNorm   = biz.phone   ? normalizePhone(biz.phone)     : null;
      const score       = computeLeadScore({ website: biz.website, phone: biz.phone, email: null, category: biz.category });

      await db
        .insert(schema.leads)
        .values({
          id:                nanoid(),
          name:              biz.name,
          category:          biz.category,
          website:           biz.website,
          websiteNormalized: websiteNorm,
          phone:             biz.phone,
          phoneNormalized:   phoneNorm,
          score,
          email:             biz.email,
          address:           biz.address || null,
          city:              biz.tags['addr:city'] || null,
          country:           biz.tags['addr:country'] || null,
          latitude:          biz.lat,
          longitude:         biz.lon,
          osmType:           biz.osmType,
          osmId:             biz.osmId,
          source:            'osm',
          rawTags:           JSON.stringify(biz.tags),
          crawlStatus:       biz.website ? 'pending' : 'skipped',
        })
        .onConflictDoNothing()
        .run();

      // Emit create event
      await db
        .insert(schema.leadEvents)
        .values({
          id:        nanoid(),
          leadId:    (await db.select({ id: schema.leads.id }).from(schema.leads).where(and(eq(schema.leads.osmType, biz.osmType), eq(schema.leads.osmId, biz.osmId))).get())!.id,
          eventType: 'created',
          payload:   JSON.stringify({ source: 'osm', category: biz.category }),
        })
        .run();

      inserted++;
    }
  }

  if (failedCategories.length === validCategories.length) {
    throw new Error(`Overpass unavailable for all selected categories: ${failedCategories.join(', ')}`);
  }
  if (failedCategories.length > 0) {
    log.warn(`[overpass] partial result; failed categories: ${failedCategories.join(', ')}`);
  }

  await writeQueryCache(hash, params, inserted + skipped);

  log.info(`[overpass] done — inserted ${inserted}, skipped ${skipped}`);
  return { inserted, skipped, total: inserted + skipped, cached: false };
}
