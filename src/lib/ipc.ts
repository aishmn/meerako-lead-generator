import type {
  AppSettings,
  CsvImportResult,
  DashboardMetrics,
  JobInfo,
  Lead,
  LeadEvent,
  LeadListParams,
  LeadListResult,
  LeadNote,
  LeadTag,
  OsmSearchRequest,
  OsmSearchResult,
} from './types';

export interface AppApi {
  app: {
    getVersion: () => Promise<string>;
  };

  // ─── Dashboard ──────────────────────────────────────────────────────────
  dashboard: {
    getMetrics: () => Promise<DashboardMetrics>;
  };

  // ─── Lead management ────────────────────────────────────────────────────
  leads: {
    list:        (params?: LeadListParams) => Promise<LeadListResult>;
    getById:     (id: string) => Promise<Lead | null>;
    create:      (payload: Partial<Lead>) => Promise<Lead>;
    update:      (id: string, payload: Partial<Lead>) => Promise<Lead>;
    deleteMany:  (ids: string[]) => Promise<number>;
    bulkStatus:  (ids: string[], status: Lead['status']) => Promise<number>;
    exportCsv:   (ids?: string[]) => Promise<string>;      // returns CSV text
    importCsv:   (rows: Record<string, string>[]) => Promise<CsvImportResult>;
    searchGlobal:(query: string) => Promise<Lead[]>;
  };

  // ─── Notes ─────────────────────────────────────────────────────────────
  notes: {
    list:   (leadId: string) => Promise<LeadNote[]>;
    add:    (leadId: string, content: string) => Promise<LeadNote>;
    remove: (noteId: string) => Promise<void>;
  };

  // ─── Events (audit trail) ───────────────────────────────────────────────
  events: {
    list: (leadId: string) => Promise<LeadEvent[]>;
  };

  // ─── OSM discovery ──────────────────────────────────────────────────────
  osm: {
    search:       (params: OsmSearchRequest) => Promise<OsmSearchResult>;
    categories:   () => Promise<string[]>;
  };

  // ─── Background jobs ────────────────────────────────────────────────────
  jobs: {
    list:    () => Promise<JobInfo[]>;
    getById: (id: string) => Promise<JobInfo | null>;
    cancel:  (id: string) => Promise<void>;
  };

  // ─── Tags ────────────────────────────────────────────────────────────────
  tags: {
    list:       ()                            => Promise<LeadTag[]>;
    listForLead:(leadId: string)              => Promise<LeadTag[]>;
    addToLead:  (leadId: string, tagId: string) => Promise<void>;
    removeFromLead: (leadId: string, tagId: string) => Promise<void>;
  };

  // ─── Settings ───────────────────────────────────────────────────────────
  settings: {
    get:    () => Promise<AppSettings>;
    update: (payload: Partial<AppSettings>) => Promise<AppSettings>;
  };
}
