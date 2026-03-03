// ─── Domain types ─────────────────────────────────────────────────────────────

export type LeadStatus  = 'new' | 'contacted' | 'interested' | 'rejected' | 'closed';
export type LeadSource  = 'osm' | 'csv_import' | 'manual';
export type CrawlStatus = 'pending' | 'crawling' | 'done' | 'failed' | 'skipped';

export interface Lead {
  id:                string;
  name:              string;
  category:          string | null;
  companyDomain:     string | null;
  website:           string | null;
  websiteNormalized: string | null;
  phone:             string | null;
  phoneNormalized:   string | null;
  email:             string | null;
  address:           string | null;
  city:              string | null;
  country:           string | null;
  latitude:          number | null;
  longitude:         number | null;
  osmType:           string | null;
  osmId:             string | null;
  source:            LeadSource;
  sourceRef:         string | null;
  status:            LeadStatus;
  notesCount:        number;
  score:             number;
  tags:              string[];
  rawTags:           Record<string, string> | null;
  crawlStatus:       CrawlStatus | null;
  crawlEmails:       string[];
  crawlPhones:       string[];
  crawlSocial:       Record<string, string | null> | null;
  crawledAt:         number | null;
  createdAt:         number;
  updatedAt:         number;
}

export interface LeadNote {
  id:        string;
  leadId:    string;
  content:   string;
  createdAt: number;
}

export interface LeadEvent {
  id:        string;
  leadId:    string;
  eventType: string;
  payload:   Record<string, unknown> | null;
  createdAt: number;
}

// ─── Search / filter params ───────────────────────────────────────────────────

export interface OsmSearchRequest {
  location:      string;
  categories:    string[];
  radiusMeters?: number;
  bbox?: {
    south: number;
    west:  number;
    north: number;
    east:  number;
  };
}

export interface OsmSearchResult {
  inserted: number;
  skipped:  number;
  total:    number;
  cached:   boolean;
  jobId:    string;
}

export interface LeadListParams {
  page?:       number;
  pageSize?:   number;
  search?:     string;
  status?:     LeadStatus | '';
  category?:   string;
  city?:       string;
  source?:     LeadSource | '';
  hasWebsite?:  boolean;
  hasPhone?:    boolean;
  hasEmail?:    boolean;
  noWebsite?:   boolean;
  minScore?:    number;
  sortBy?:      'name' | 'createdAt' | 'updatedAt' | 'status' | 'score';
  sortDir?:     'asc' | 'desc';
}

export interface LeadListResult {
  leads:  Lead[];
  total:  number;
  page:   number;
  pages:  number;
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export interface LeadTag {
  id:    string;
  name:  string;
  color: string;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export interface CsvImportResult {
  inserted:   number;
  duplicates: number;
  errors:     number;
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface JobInfo {
  id:          string;
  type:        string;
  status:      JobStatus;
  attempts:    number;
  maxAttempts: number;
  error:       string | null;
  createdAt:   number;
  completedAt: number | null;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalLeads:    number;
  newThisWeek:   number;
  withWebsite:   number;
  noWebsite:     number;
  withPhone:     number;
  hotProspects:  number;   // no website + has phone (top targets for Meerako)
  pendingCrawls: number;
  byStatus:      Record<string, number>;
  topCategories: Array<{ category: string; count: number }>;
  recentEvents:  LeadEvent[];
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  general: {
    appName: string;
    theme:   'dark' | 'light';
  };
}
