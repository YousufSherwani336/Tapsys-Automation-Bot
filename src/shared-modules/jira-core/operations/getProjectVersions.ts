import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface ProjectVersion {
  id: string;
  self: string;
  name: string;
  description?: string;
  archived: boolean;
  released: boolean;
  releaseDate?: string;
}

export async function getProjectVersions(
  client: JiraClient,
  projectKeyOrId: string,
): Promise<ProjectVersion[]> {
  try {
    const response = await client.http.get<ProjectVersion[]>(
      `/project/${encodeURIComponent(projectKeyOrId)}/versions`,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
