/**
 * Background Job Queue
 *
 * SQLite-backed. All async work (OSM queries, website crawls) is queued here
 * so the UI thread is never blocked.
 *
 * Design:
 *   - Jobs are persisted to DB so they survive app restarts
 *   - A single setInterval polls every POLL_INTERVAL ms
 *   - Concurrency is 1 (avoids thrashing free APIs)
 *   - Failed jobs are retried up to maxAttempts times with exponential backoff
 */

import log from 'electron-log/main';
import { and, asc, eq, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../../../db/schema';
import { getDb } from '../db';
import { processCrawlJob } from './crawler-service';
import type { OsmSearchParams } from './osm-service';

const POLL_INTERVAL  = 2_000;  // ms
const MAX_JOB_AGE_MS = 7 * 24 * 60 * 60 * 1000; // prune jobs older than 7 days

export type JobType = 'osm_query' | 'website_crawl';

export interface OsmQueryPayload extends OsmSearchParams { }
export interface CrawlPayload { leadId: string }

let pollerInterval: NodeJS.Timeout | null = null;
let running = false;

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueueJob(
  type: JobType,
  payload: OsmQueryPayload | CrawlPayload,
  maxAttempts = 3
): Promise<string> {
  const db = getDb();
  const id = nanoid();
  await db
    .insert(schema.jobs)
    .values({
      id,
      type,
      status:  'pending',
      payload: JSON.stringify(payload),
      maxAttempts,
    })
    .run();
  log.info(`[queue] enqueued job ${id} type=${type}`);
  return id;
}

export async function enqueueCrawlIfNeeded(leadId: string): Promise<void> {
  const db = getDb();
  const lead = await db
    .select({ crawlStatus: schema.leads.crawlStatus, website: schema.leads.website })
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId))
    .get();

  if (lead?.website && lead.crawlStatus === 'pending') {
    await enqueueJob('website_crawl', { leadId });
  }
}

// ─── Job status ───────────────────────────────────────────────────────────────

export async function getJobStatus(id: string): Promise<schema.Job | null> {
  const db = getDb();
  return db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get() ?? null;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

async function processOne(): Promise<void> {
  const db  = getDb();
  const now = Date.now();

  // Pick the next pending job whose scheduled time has passed
  const job = await db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.status, 'pending'),
        lte(schema.jobs.scheduledAt, now)
      )
    )
    .orderBy(asc(schema.jobs.scheduledAt))
    .limit(1)
    .get();

  if (!job) return;

  // Mark as running
  await db
    .update(schema.jobs)
    .set({ status: 'running', startedAt: now, attempts: job.attempts + 1 })
    .where(eq(schema.jobs.id, job.id))
    .run();

  log.info(`[queue] processing job ${job.id} type=${job.type} attempt=${job.attempts + 1}`);

  try {
    const payload = JSON.parse(job.payload) as OsmQueryPayload | CrawlPayload;

    if (job.type === 'osm_query') {
      const { searchOsm } = await import('./osm-service');
      const result = await searchOsm(payload as OsmQueryPayload);
      await db
        .update(schema.jobs)
        .set({ status: 'done', result: JSON.stringify(result), completedAt: Date.now() })
        .where(eq(schema.jobs.id, job.id))
        .run();
    } else if (job.type === 'website_crawl') {
      await processCrawlJob((payload as CrawlPayload).leadId);
      await db
        .update(schema.jobs)
        .set({ status: 'done', completedAt: Date.now() })
        .where(eq(schema.jobs.id, job.id))
        .run();
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }

    log.info(`[queue] job ${job.id} done`);
  } catch (err) {
    const error    = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;

    if (attempts >= job.maxAttempts) {
      log.error(`[queue] job ${job.id} failed permanently: ${error}`);
      await db
        .update(schema.jobs)
        .set({ status: 'failed', error, completedAt: Date.now() })
        .where(eq(schema.jobs.id, job.id))
        .run();
    } else {
      // Exponential backoff: 5s, 25s, 125s, ...
      const retryDelay = 5_000 * 5 ** attempts;
      log.warn(`[queue] job ${job.id} failed (attempt ${attempts}/${job.maxAttempts}), retrying in ${retryDelay}ms`);
      await db
        .update(schema.jobs)
        .set({
          status:      'pending',
          error,
          scheduledAt: Date.now() + retryDelay,
        })
        .where(eq(schema.jobs.id, job.id))
        .run();
    }
  }
}

async function pruneOldJobs(): Promise<void> {
  const db      = getDb();
  const cutoff  = Date.now() - MAX_JOB_AGE_MS;
  await db
    .delete(schema.jobs)
    .where(
      and(
        eq(schema.jobs.status, 'done'),
        lte(schema.jobs.completedAt!, cutoff)
      )
    )
    .run();
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function startJobRunner(): void {
  if (pollerInterval) return;
  log.info('[queue] job runner started');

  pollerInterval = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processOne();
    } finally {
      running = false;
    }
  }, POLL_INTERVAL);

  // Prune old jobs once at startup
  pruneOldJobs().catch((err) => log.warn('[queue] prune error', err));
}

export function stopJobRunner(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    log.info('[queue] job runner stopped');
  }
}

export async function pendingJobsCount(): Promise<number> {
  const db  = getDb();
  const row = await db
    .select({ count: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.status, 'pending'))
    .all();
  return row.length;
}
