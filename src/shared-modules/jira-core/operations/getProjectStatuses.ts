import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface ProjectStatusCategory {
  self: string;
  id: string;
  name: string;
  statuses: Array<{ id: string; name: string }>;
}

export async function getProjectStatuses(
  client: JiraClient,
  projectKeyOrId: string,
): Promise<ProjectStatusCategory[]> {
  try {
    const response = await client.http.get<ProjectStatusCategory[]>(
      `/project/${encodeURIComponent(projectKeyOrId)}/statuses`,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
