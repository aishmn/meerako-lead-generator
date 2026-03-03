/**
 * Deduplication Service
 *
 * Primary dedup keys in priority order:
 *  1. osm_type + osm_id      — for OSM-sourced leads
 *  2. website_normalized     — canonical URL without www / trailing slash
 *  3. phone_normalized       — digits only
 */

import { and, eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { getDb } from '../db';
import { normalizeWebsite } from './crawler-service';
import { normalizePhone } from './phone-service';

export type DupeField = 'osm' | 'website' | 'phone';

export interface DupeMatch {
  existingId: string;
  field:      DupeField;
  confidence: number;
}

export interface IncomingLead {
  osmType?:  string | null;
  osmId?:    string | null;
  website?:  string | null;
  phone?:    string | null;
}

/** Returns the first duplicate match found, or null. */
export async function findDuplicate(lead: IncomingLead): Promise<DupeMatch | null> {
  const db = getDb();

  if (lead.osmType && lead.osmId) {
    const row = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.osmType, lead.osmType), eq(schema.leads.osmId, lead.osmId)))
      .get();
    if (row) return { existingId: row.id, field: 'osm', confidence: 1.0 };
  }

  if (lead.website) {
    const norm = normalizeWebsite(lead.website);
    if (norm) {
      const row = await db
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(eq(schema.leads.websiteNormalized, norm))
        .get();
      if (row) return { existingId: row.id, field: 'website', confidence: 0.97 };
    }
  }

  if (lead.phone) {
    const norm = normalizePhone(lead.phone);
    if (norm) {
      const row = await db
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(eq(schema.leads.phoneNormalized, norm))
        .get();
      if (row) return { existingId: row.id, field: 'phone', confidence: 0.90 };
    }
  }

  return null;
}

/**
 * Batch deduplication for CSV imports.
 * Deduplicates both against DB and within the batch.
 */
export async function deduplicateBatch<T extends IncomingLead>(
  rows: T[]
): Promise<{
  toInsert:   T[];
  duplicates: Array<{ row: T; match: DupeMatch }>;
}> {
  const toInsert:   T[]                               = [];
  const duplicates: Array<{ row: T; match: DupeMatch }> = [];

  const batchWebsites = new Map<string, number>();
  const batchPhones   = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const match = await findDuplicate(row);
    if (match) { duplicates.push({ row, match }); continue; }

    if (row.website) {
      const norm = normalizeWebsite(row.website);
      if (norm) {
        if (batchWebsites.has(norm)) {
          duplicates.push({ row, match: { existingId: `batch:${batchWebsites.get(norm)}`, field: 'website', confidence: 0.97 } });
          continue;
        }
        batchWebsites.set(norm, i);
      }
    }

    if (row.phone) {
      const norm = normalizePhone(row.phone);
      if (norm) {
        if (batchPhones.has(norm)) {
          duplicates.push({ row, match: { existingId: `batch:${batchPhones.get(norm)}`, field: 'phone', confidence: 0.90 } });
          continue;
        }
        batchPhones.set(norm, i);
      }
    }

    toInsert.push(row);
  }

  return { toInsert, duplicates };
}
