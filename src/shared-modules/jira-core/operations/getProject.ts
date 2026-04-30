import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraProjectDetail {
  id: string;
  key: string;
  name: string;
  self: string;
  description?: string;
  projectTypeKey?: string;
  lead?: { name: string; displayName: string };
  components?: Array<{ id: string; name: string }>;
  issueTypes?: Array<{ id: string; name: string; subtask: boolean }>;
}

export async function getProject(
  client: JiraClient,
  keyOrId: string,
): Promise<JiraProjectDetail> {
  try {
    const response = await client.http.get<JiraProjectDetail>(
      `/project/${encodeURIComponent(keyOrId)}`,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
