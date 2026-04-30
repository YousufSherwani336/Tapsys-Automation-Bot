/**
 * Parses natural language date expressions (English + Roman Urdu) into
 * { startDate, endDate } ISO strings relative to a given reference date.
 */

export interface ParsedDateRange {
  type: 'yesterday' | 'today' | 'mtd' | 'last_7_days' | 'last_30_days' | 'custom';
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;     // Human-readable label e.g. "Yesterday (2025-01-14)"
}

/** Format date as YYYY-MM-DD using LOCAL date components — never UTC. */
function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Parses a date range string.
 * @param input - Natural language expression
 * @param referenceDate - The "today" anchor date (defaults to system today)
 */
export function parseDateRange(
  input: string,
  referenceDate: Date = new Date(),
): ParsedDateRange {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  const normalized = input.toLowerCase().trim();

  // Yesterday / kal
  if (/\b(yesterday|kal|kal ka|kal ki)\b/.test(normalized)) {
    const d = addDays(today, -1);
    const iso = toIso(d);
    return { type: 'yesterday', startDate: iso, endDate: iso, label: `Yesterday (${iso})` };
  }

  // Today / aaj
  if (/\b(today|aaj|aaj ka|aaj ki)\b/.test(normalized)) {
    const iso = toIso(today);
    return { type: 'today', startDate: iso, endDate: iso, label: `Today (${iso})` };
  }

  // MTD / month-to-date / is maheenay / is mahine
  if (
    /\b(mtd|month.?to.?date|is maheenay|is mahine|this month|is maah)\b/.test(normalized)
  ) {
    const start = toIso(startOfMonth(today));
    const end = toIso(addDays(today, -1));
    return { type: 'mtd', startDate: start, endDate: end, label: `MTD (${start} → ${end})` };
  }

  // Last 30 days / pichhlay 30 din
  if (/\b(last.?30.?days?|pichhlay? 30 din|30 din)\b/.test(normalized)) {
    const start = toIso(addDays(today, -30));
    const end = toIso(addDays(today, -1));
    return { type: 'last_30_days', startDate: start, endDate: end, label: `Last 30 Days (${start} → ${end})` };
  }

  // Last week / last 7 days / pichhli hafte
  if (/\b(last.?week|last.?7.?days?|pichhla hafte|pichhli hafte|7 din)\b/.test(normalized)) {
    const start = toIso(addDays(today, -7));
    const end = toIso(addDays(today, -1));
    return { type: 'last_7_days', startDate: start, endDate: end, label: `Last 7 Days (${start} → ${end})` };
  }

  // Default: yesterday
  const d = addDays(today, -1);
  const iso = toIso(d);
  return { type: 'yesterday', startDate: iso, endDate: iso, label: `Yesterday (${iso})` };
}

/** Injects date variables into a T-SQL template's DECLARE section. */
export function injectDates(sql: string, range: ParsedDateRange): string {
  return sql
    .replace(
      /DECLARE\s+@start_date\s+DATE\s*=\s*[^;\n]+/gi,
      `DECLARE @start_date DATE = '${range.startDate}'`,
    )
    .replace(
      /DECLARE\s+@end_date\s+DATE\s*=\s*[^;\n]+/gi,
      `DECLARE @end_date DATE = '${range.endDate}'`,
    );
}
