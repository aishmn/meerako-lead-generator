/**
 * Website Crawler & Enrichment Service
 *
 * For each lead that has a website, this service:
 *   1. Checks robots.txt — skips if disallowed
 *   2. Fetches the homepage
 *   3. Extracts emails, phones, and social links
 *   4. Discovers /contact, /about, /imprint sub-pages and crawls those too
 *   5. Persists results back to the lead row
 *
 * Per-domain rate limiting: 1 request per 3 seconds.
 * All HTTP errors are non-fatal — partial results are still stored.
 */

import { URL } from 'node:url';
import log from 'electron-log/main';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../../../db/schema';
import { getDb } from '../db';
import { computeLeadScore } from './lead-score';

const USER_AGENT   = 'Meerako Lead Generator/1.0 (internal-lead-discovery-tool)';
const DOMAIN_DELAY = 3000; // ms between requests to the same domain
const FETCH_TIMEOUT = 10_000; // ms

// ─── Domain rate limiter ──────────────────────────────────────────────────────

const domainLastFetch = new Map<string, number>();

async function domainRateLimit(domain: string): Promise<void> {
  const last = domainLastFetch.get(domain) ?? 0;
  const wait = DOMAIN_DELAY - (Date.now() - last);
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  domainLastFetch.set(domain, Date.now());
}

// ─── Website normalization ────────────────────────────────────────────────────

/**
 * Produce a canonical URL string for deduplication.
 * Strips www., normalizes protocol, removes trailing slash.
 * Returns null if the input is not a parseable URL.
 */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url = raw.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    const host   = parsed.hostname.replace(/^www\./, '');
    return `${host}${parsed.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}

// ─── robots.txt parser ────────────────────────────────────────────────────────

async function isAllowedByRobots(baseUrl: string): Promise<boolean> {
  const domain = extractDomain(baseUrl);
  if (!domain) return false;

  const robotsUrl = `https://${domain}/robots.txt`;
  try {
    await domainRateLimit(domain);
    const res = await fetchWithTimeout(robotsUrl);
    if (!res.ok) return true; // no robots.txt = crawling allowed
    const text = await res.text();
    return !isDisallowed(text, '/');
  } catch {
    return true; // network error = assume allowed
  }
}

function isDisallowed(robotsTxt: string, path: string): boolean {
  let inOurBlock = false;
  for (const raw of robotsTxt.split('\n')) {
    const line = raw.trim().toLowerCase();
    if (line.startsWith('user-agent:')) {
      const agent = line.replace('user-agent:', '').trim();
      inOurBlock = agent === '*' || agent.includes('leadforge');
      continue;
    }
    if (inOurBlock && line.startsWith('disallow:')) {
      const disallowedPath = line.replace('disallow:', '').trim();
      if (disallowedPath && path.startsWith(disallowedPath)) return true;
    }
  }
  return false;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Extraction regexes ───────────────────────────────────────────────────────

const EMAIL_RE  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE  = /(?:\+?\d[\d\s\-().]{6,}\d)/g;

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  facebook:  /(?:facebook\.com|fb\.com)\/[\w.]+/i,
  twitter:   /(?:twitter\.com|x\.com)\/\w+/i,
  linkedin:  /linkedin\.com\/(?:company|in)\/[\w-]+/i,
  instagram: /instagram\.com\/[\w.]+/i,
};

function extractEmails(html: string): string[] {
  const raw = html.match(EMAIL_RE) ?? [];
  return [...new Set(raw.map((e) => e.toLowerCase()).filter((e) => !e.endsWith('.png') && !e.endsWith('.jpg')))];
}

function extractPhones(html: string): string[] {
  const raw = html.match(PHONE_RE) ?? [];
  return [...new Set(raw.map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 7))];
}

function extractSocial(html: string): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const [name, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const match = html.match(pattern);
    result[name] = match ? `https://${match[0]}` : null;
  }
  return result;
}

// Sub-pages that often have contact information
const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us', '/imprint', '/impressum'];

function findContactLinks(html: string, baseUrl: string): string[] {
  const domain = extractDomain(baseUrl);
  if (!domain) return [];

  const links = new Set<string>();
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    for (const path of CONTACT_PATHS) {
      if (href.includes(path)) {
        try {
          const abs: URL = new URL(href, `https://${domain}`);
          if (abs.hostname === domain) links.add(abs.toString());
        } catch { /* ignore */ }
      }
    }
  }
  return [...links].slice(0, 3); // max 3 sub-pages
}

// ─── Core crawl function ──────────────────────────────────────────────────────

export interface CrawlResult {
  emails:  string[];
  phones:  string[];
  social:  Record<string, string | null>;
}

export async function crawlWebsite(website: string): Promise<CrawlResult | null> {
  const domain = extractDomain(website);
  if (!domain) return null;

  const allowed = await isAllowedByRobots(website);
  if (!allowed) {
    log.info(`[crawler] robots.txt disallows crawling: ${domain}`);
    return null;
  }

  const allEmails  = new Set<string>();
  const allPhones  = new Set<string>();
  let   social:  Record<string, string | null> = {};

  // ── Fetch homepage ────────────────────────────────────────────────────────
  let html = '';
  try {
    await domainRateLimit(domain);
    const res = await fetchWithTimeout(website.startsWith('http') ? website : `https://${website}`);
    if (res.ok) html = await res.text();
  } catch (err) {
    log.warn(`[crawler] failed to fetch ${website}`, err);
    return null;
  }

  extractEmails(html).forEach((e) => allEmails.add(e));
  extractPhones(html).forEach((p) => allPhones.add(p));
  social = extractSocial(html);

  // ── Crawl sub-pages ───────────────────────────────────────────────────────
  const subPages = findContactLinks(html, website);
  for (const url of subPages) {
    try {
      await domainRateLimit(domain);
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const subHtml = await res.text();
      extractEmails(subHtml).forEach((e) => allEmails.add(e));
      extractPhones(subHtml).forEach((p) => allPhones.add(p));
      const subSocial = extractSocial(subHtml);
      for (const [k, v] of Object.entries(subSocial)) {
        if (!social[k] && v) social[k] = v;
      }
    } catch { /* ignore sub-page errors */ }
  }

  return {
    emails: [...allEmails].slice(0, 10),
    phones: [...allPhones].slice(0, 10),
    social,
  };
}

// ─── Persist crawl results ────────────────────────────────────────────────────

export async function processCrawlJob(leadId: string): Promise<void> {
  const db = getDb();

  const lead = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId))
    .get();

  if (!lead?.website) {
    await db
      .update(schema.leads)
      .set({ crawlStatus: 'skipped', updatedAt: Date.now() })
      .where(eq(schema.leads.id, leadId))
      .run();
    return;
  }

  // Mark as running
  await db
    .update(schema.leads)
    .set({ crawlStatus: 'crawling', updatedAt: Date.now() })
    .where(eq(schema.leads.id, leadId))
    .run();

  try {
    const result = await crawlWebsite(lead.website);

    if (!result) {
      await db
        .update(schema.leads)
        .set({ crawlStatus: 'failed', updatedAt: Date.now() })
        .where(eq(schema.leads.id, leadId))
        .run();
      return;
    }

    const finalEmail = lead.email ?? result.emails[0] ?? null;
    const newScore   = computeLeadScore({
      website:  lead.website,
      phone:    lead.phone,
      email:    finalEmail,
      category: lead.category,
    });

    await db
      .update(schema.leads)
      .set({
        crawlStatus: 'done',
        crawlEmails: JSON.stringify(result.emails),
        crawlPhones: JSON.stringify(result.phones),
        crawlSocial: JSON.stringify(result.social),
        // Promote first crawled email if no email set yet
        email:     finalEmail,
        score:     newScore,
        crawledAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(schema.leads.id, leadId))
      .run();

    await db
      .insert(schema.leadEvents)
      .values({
        id:        nanoid(),
        leadId,
        eventType: 'enriched',
        payload:   JSON.stringify({
          emails: result.emails.length,
          phones: result.phones.length,
          social: Object.keys(result.social).filter((k) => result.social[k]),
        }),
      })
      .run();

    log.info(`[crawler] enriched lead ${leadId}: ${result.emails.length} emails, ${result.phones.length} phones`);
  } catch (err) {
    log.error(`[crawler] error processing lead ${leadId}`, err);
    await db
      .update(schema.leads)
      .set({ crawlStatus: 'failed', updatedAt: Date.now() })
      .where(eq(schema.leads.id, leadId))
      .run();
  }
}
