import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraResolution {
  id: string;
  self: string;
  name: string;
  description: string;
}

export async function getResolutions(client: JiraClient): Promise<JiraResolution[]> {
  try {
    const response = await client.http.get<JiraResolution[]>('/resolution');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
