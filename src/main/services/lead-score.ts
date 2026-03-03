/**
 * Lead Prospect Scoring — Meerako.com (Software & Web Agency)
 *
 * Score reflects how attractive a lead is for a web/software agency.
 * A business with NO website is the #1 opportunity — they need one built.
 *
 * Scoring breakdown (max 100):
 *   +50  No website detected          → prime prospect for web dev
 *   +20  Has a phone number           → directly reachable by sales
 *   +15  Has an email address         → can pitch via email
 *   +15  Agency-friendly category     → SMB types that regularly need websites
 */

// Categories where businesses most commonly need web presence built from scratch.
const AGENCY_FRIENDLY_CATEGORIES = new Set([
  'restaurant', 'cafe', 'bar', 'fast_food', 'bakery', 'hotel', 'hostel',
  'guest_house', 'beauty_salon', 'hairdresser', 'gym', 'dentist', 'clinic',
  'pharmacy', 'lawyer', 'accountant', 'architect', 'real_estate',
  'car_repair', 'car_wash', 'bicycle_shop', 'pet_grooming',
  'florist', 'jewellery', 'tailor', 'shoe_shop', 'clothes',
  'optician', 'physiotherapist', 'massage', 'spa', 'yoga',
  'driving_school', 'language_school', 'tutoring', 'travel_agency',
  'funeral_home', 'event_venue', 'wedding_planner', 'photographer',
  'printing', 'locksmith', 'plumber', 'electrician', 'painter',
]);

export interface ScoreInput {
  website?:  string | null;
  phone?:    string | null;
  email?:    string | null;
  category?: string | null;
}

export function computeLeadScore(lead: ScoreInput): number {
  let score = 0;

  // Biggest signal: no website → business needs one
  if (!lead.website) score += 50;

  // Reachability
  if (lead.phone) score += 20;
  if (lead.email) score += 15;

  // Category fit for a web/software agency
  if (lead.category && AGENCY_FRIENDLY_CATEGORIES.has(lead.category)) score += 15;

  return Math.min(100, score);
}
