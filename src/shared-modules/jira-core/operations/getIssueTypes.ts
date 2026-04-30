import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraIssueType {
  id: string;
  self: string;
  name: string;
  description: string;
  subtask: boolean;
  iconUrl?: string;
}

export async function getIssueTypes(client: JiraClient): Promise<JiraIssueType[]> {
  try {
    const response = await client.http.get<JiraIssueType[]>('/issuetype');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
