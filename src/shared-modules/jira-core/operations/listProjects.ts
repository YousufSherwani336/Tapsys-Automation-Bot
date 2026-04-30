import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  self: string;
  projectTypeKey?: string;
  lead?: { name: string; displayName: string };
}

export async function listProjects(client: JiraClient): Promise<JiraProject[]> {
  try {
    const response = await client.http.get<JiraProject[]>('/project');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
