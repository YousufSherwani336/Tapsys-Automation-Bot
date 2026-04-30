import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraPriority {
  id: string;
  self: string;
  name: string;
  description?: string;
  iconUrl?: string;
}

export async function getPriorities(client: JiraClient): Promise<JiraPriority[]> {
  try {
    const response = await client.http.get<JiraPriority[]>('/priority');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
