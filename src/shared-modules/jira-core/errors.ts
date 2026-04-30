import axios from 'axios';

export type JiraErrorCode =
  | 'auth'
  | 'not_found'
  | 'validation'
  | 'rate_limit'
  | 'unknown';

export class JiraError extends Error {
  readonly code: JiraErrorCode;
  readonly status: number;
  readonly raw?: unknown;

  constructor(message: string, code: JiraErrorCode, status: number, raw?: unknown) {
    super(message);
    this.name = 'JiraError';
    this.code = code;
    this.status = status;
    this.raw = raw;
  }
}

/** Maps axios HTTP errors and Jira response shapes to a typed JiraError. */
export function normalizeError(err: unknown): JiraError {
  if (err instanceof JiraError) {
    return err;
  }

  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const raw = err.response?.data;

    if (status === 401 || status === 403) {
      return new JiraError(
        `Jira authentication failed (HTTP ${status})`,
        'auth',
        status,
        raw,
      );
    }
    if (status === 404) {
      return new JiraError(
        `Jira resource not found (HTTP 404)`,
        'not_found',
        status,
        raw,
      );
    }
    if (status === 400 || status === 422) {
      return new JiraError(
        `Jira validation error (HTTP ${status})`,
        'validation',
        status,
        raw,
      );
    }
    if (status === 429) {
      return new JiraError(
        `Jira rate limit exceeded (HTTP 429)`,
        'rate_limit',
        status,
        raw,
      );
    }

    return new JiraError(
      err.message ?? `Jira request failed (HTTP ${status})`,
      'unknown',
      status,
      raw,
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  return new JiraError(message, 'unknown', 0, err);
}
