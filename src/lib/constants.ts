import type { LeadSource, LeadStatus } from './types';

export const APP_NAME = 'Meerako Lead Generator';

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'interested',
  'rejected',
  'closed',
];

export const LEAD_SOURCES: LeadSource[] = ['osm', 'csv_import', 'manual'];
