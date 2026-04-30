import axios, { type AxiosInstance } from 'axios';
import https from 'https';

export interface JiraClientOptions {
  host: string;
  email: string;
  token: string;
}

export interface JiraClient {
  /** Underlying axios instance — use for all Jira REST calls. */
  http: AxiosInstance;
  host: string;
}

/**
 * Creates an authenticated Jira REST API v3 client.
 * Auth: HTTP Basic with email:token (Atlassian API token format).
 */
export function createJiraClient(opts: JiraClientOptions): JiraClient {
  const cleanHost = opts.host.replace(/^https?:\/\//, '');
  const http = axios.create({
    baseURL: `https://${cleanHost}/rest/api/2`,
    timeout: 15_000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${opts.token}`,
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });

  return { http, host: cleanHost };
}
