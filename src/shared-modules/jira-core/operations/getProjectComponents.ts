import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface ProjectComponent {
  id: string;
  self: string;
  name: string;
  description?: string;
  lead?: { name: string; displayName: string };
  assigneeType?: string;
  isAssigneeTypeValid?: boolean;
}

export async function getProjectComponents(
  client: JiraClient,
  projectKeyOrId: string,
): Promise<ProjectComponent[]> {
  try {
    const response = await client.http.get<ProjectComponent[]>(
      `/project/${encodeURIComponent(projectKeyOrId)}/components`,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
