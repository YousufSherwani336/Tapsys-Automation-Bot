import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraStatus {
  id: string;
  self: string;
  name: string;
  description: string;
  statusCategory?: { id: number; key: string; name: string; colorName: string };
}

export async function getStatuses(client: JiraClient): Promise<JiraStatus[]> {
  try {
    const response = await client.http.get<JiraStatus[]>('/status');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
