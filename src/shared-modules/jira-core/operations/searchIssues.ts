import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';
import type { JiraIssue } from './getIssue.js';

export interface SearchIssuesOptions {
  fields?: string[];
  maxResults?: number;
}

export interface SearchIssuesResult {
  total: number;
  issues: JiraIssue[];
}

export async function searchIssues(
  client: JiraClient,
  jql: string,
  opts: SearchIssuesOptions = {},
): Promise<SearchIssuesResult> {
  try {
    const body: Record<string, unknown> = { jql };
    if (opts.fields) body['fields'] = opts.fields;
    if (opts.maxResults !== undefined) body['maxResults'] = opts.maxResults;

    const response = await client.http.post<SearchIssuesResult>('/search', body);
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
