/**
 * SQL validator — whitelist-based safety check for generated queries.
 * Only SELECT, WITH (CTE), and DECLARE (T-SQL date vars) are permitted.
 * Any destructive or administrative statement is rejected before execution.
 */

export interface SqlValidationResult {
  valid: boolean;
  reason?: string;
  cleanedSql?: string;
}

/** Keywords that must never appear in an approved query. */
const BLOCKED_KEYWORDS: string[] = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'MERGE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'XP_CMDSHELL',
  'SP_CONFIGURE',
  'SP_EXECUTESQL',
  'OPENROWSET',
  'OPENDATASOURCE',
  'BULK INSERT',
  'WRITETEXT',
  'UPDATETEXT',
  'RECONFIGURE',
  'SHUTDOWN',
];

/** Allowed first keywords (after stripping DECLARE blocks and comments). */
const ALLOWED_STARTERS = new Set(['SELECT', 'WITH', 'DECLARE']);

/** Remove single-line (--) and multi-line (/* *\/) SQL comments. */
function stripComments(sql: string): string {
  // Multi-line comments
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Single-line comments
  result = result.replace(/--[^\r\n]*/g, ' ');
  return result;
}

/**
 * Validates a SQL string for safety.
 * Returns `{valid: true, cleanedSql}` if safe, `{valid: false, reason}` if not.
 */
export function validateSql(sql: string): SqlValidationResult {
  if (!sql || !sql.trim()) {
    return { valid: false, reason: 'Empty SQL query.' };
  }

  // Strip comments before analysis — comments can hide blocked keywords.
  const stripped = stripComments(sql);

  // Check for blocked keywords (case-insensitive, word-boundary aware).
  const upper = stripped.toUpperCase();
  for (const keyword of BLOCKED_KEYWORDS) {
    // Use word-boundary regex to avoid false positives (e.g., "UPDATETEXT" ≠ "UPDATE").
    const pattern = new RegExp(`\\b${keyword.replace(/ /g, '\\s+')}\\b`);
    if (pattern.test(upper)) {
      return { valid: false, reason: `Blocked keyword detected: ${keyword}` };
    }
  }

  // Determine the first meaningful keyword (skip DECLARE preamble).
  // DECLARE is allowed at the start for T-SQL date variable setup.
  const tokens = stripped.trim().split(/\s+/);
  const firstKeyword = tokens[0]?.toUpperCase() ?? '';

  if (!ALLOWED_STARTERS.has(firstKeyword)) {
    return {
      valid: false,
      reason: `SQL must start with SELECT, WITH, or DECLARE. Got: "${firstKeyword}".`,
    };
  }

  // If starts with DECLARE, ensure there is a SELECT or WITH further in the query.
  if (firstKeyword === 'DECLARE') {
    const hasSelect = /\bSELECT\b/i.test(stripped);
    if (!hasSelect) {
      return { valid: false, reason: 'DECLARE block has no SELECT statement.' };
    }
  }

  // Reject any attempt to use EXEC / EXECUTE (dynamic SQL).
  if (/\bEXEC(UTE)?\b/i.test(stripped)) {
    return { valid: false, reason: 'Dynamic execution (EXEC/EXECUTE) is not allowed.' };
  }

  // Reject semicolons that could indicate stacked statements.
  // Allow semicolons only inside string literals — a full parser would be needed
  // for precision; here we reject any semicolon outside a DECLARE line.
  const noDeclarelines = stripped
    .split('\n')
    .filter((line) => !/^\s*DECLARE\s/i.test(line))
    .join('\n');
  if (/;/.test(noDeclarelines)) {
    return { valid: false, reason: 'Semicolons in SELECT body are not allowed (stacked statements risk).' };
  }

  return { valid: true, cleanedSql: sql.trim() };
}
