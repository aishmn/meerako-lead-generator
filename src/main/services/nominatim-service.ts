/**
 * Nominatim Geocoding Service
 *
 * Converts location text → bounding box + centroid.
 * Rules:
 *  - Max 1 request/second (hard requirement from OSM usage policy)
 *  - Results are cached permanently in the DB — location names don't change
 *  - Requires a descriptive User-Agent per OSM policy
 */

import crypto from 'node:crypto';
import log from 'electron-log/main';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../../../db/schema';
import { getDb } from '../db';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT     = 'Meerako Lead Generator/1.0 (internal-lead-discovery-tool)';
const MIN_INTERVAL   = 1100; // ms — slightly above 1 s to be safe

export interface BoundingBox {
  south: number;
  west:  number;
  north: number;
  east:  number;
}

export interface GeocodedLocation {
  displayName: string;
  bbox:        BoundingBox;
  center:      { lat: number; lon: number };
}

let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const now  = Date.now();
  const wait = MIN_INTERVAL - (now - lastRequestAt);
  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

function cacheKey(q: string): string {
  return crypto.createHash('sha256').update(normalizeQuery(q)).digest('hex').slice(0, 16);
}

export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  const normalized = normalizeQuery(query);
  const db         = getDb();

  // ── 1. Check permanent cache ──────────────────────────────────────────────
  const cached = await db
    .select()
    .from(schema.geocodeCache)
    .where(eq(schema.geocodeCache.query, normalized))
    .get();

  if (cached) {
    log.debug(`[nominatim] cache hit: "${normalized}"`);
    return JSON.parse(cached.result) as GeocodedLocation;
  }

  // ── 2. Enforce rate limit ─────────────────────────────────────────────────
  await rateLimit();

  // ── 3. Fetch from Nominatim ───────────────────────────────────────────────
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  log.info(`[nominatim] geocoding: "${query}"`);

  let data: unknown[];
  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      log.error(`[nominatim] HTTP ${res.status} for query: "${query}"`);
      return null;
    }
    data = (await res.json()) as unknown[];
  } catch (err) {
    log.error('[nominatim] fetch error', err);
    return null;
  }

  if (!data.length) {
    log.warn(`[nominatim] no results for: "${query}"`);
    return null;
  }

  const item = data[0] as {
    display_name: string;
    boundingbox:  string[];
    lat:          string;
    lon:          string;
  };

  const result: GeocodedLocation = {
    displayName: item.display_name,
    bbox: {
      south: parseFloat(item.boundingbox[0]),
      north: parseFloat(item.boundingbox[1]),
      west:  parseFloat(item.boundingbox[2]),
      east:  parseFloat(item.boundingbox[3]),
    },
    center: {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    },
  };

  // ── 4. Persist to cache ───────────────────────────────────────────────────
  await db
    .insert(schema.geocodeCache)
    .values({
      id:     cacheKey(normalized),
      query:  normalized,
      result: JSON.stringify(result),
    })
    .onConflictDoNothing()
    .run();

  return result;
}
