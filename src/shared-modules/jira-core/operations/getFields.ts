import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  orderable: boolean;
  navigable: boolean;
  searchable: boolean;
  schema?: { type: string; system?: string; custom?: string; customId?: number };
}

export async function getFields(client: JiraClient): Promise<JiraField[]> {
  try {
    const response = await client.http.get<JiraField[]>('/field');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
