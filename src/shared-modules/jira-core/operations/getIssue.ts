import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: Record<string, unknown>;
}

export async function getIssue(client: JiraClient, key: string): Promise<JiraIssue> {
  try {
    const response = await client.http.get<JiraIssue>(`/issue/${encodeURIComponent(key)}`);
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
