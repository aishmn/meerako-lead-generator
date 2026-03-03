/**
 * Phone Normalization Service
 *
 * Strips non-digit characters and produces a canonical form for deduplication.
 * Does NOT require libphonenumber (no native dependencies) — uses heuristics
 * that are accurate enough for dedup at this scale.
 *
 * For display purposes the original string is preserved; phoneNormalized is
 * only used as a dedup key.
 */

/**
 * Strip all non-digit characters.
 * If the result starts with a leading country code (e.g. 1 for US/CA),
 * that is preserved. We do NOT strip country codes because doing so
 * incorrectly would cause false-positive dedup matches across countries.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null; // too short to be a real number
  return digits;
}

/**
 * Format a phone number for display.
 * Returns the original string if it's not clearly a digit-only string.
 */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}
