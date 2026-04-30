import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface PermissionResult {
  permissions: Record<string, {
    id: string;
    key: string;
    name: string;
    type: string;
    description: string;
    havePermission: boolean;
  }>;
}

export interface GetMyPermissionsOptions {
  projectKey?: string;
  projectId?: string;
  issueKey?: string;
  issueId?: string;
}

export async function getMyPermissions(
  client: JiraClient,
  opts: GetMyPermissionsOptions = {},
): Promise<PermissionResult> {
  try {
    const params: Record<string, unknown> = {};
    if (opts.projectKey) params['projectKey'] = opts.projectKey;
    if (opts.projectId) params['projectId'] = opts.projectId;
    if (opts.issueKey) params['issueKey'] = opts.issueKey;
    if (opts.issueId) params['issueId'] = opts.issueId;

    const response = await client.http.get<PermissionResult>('/mypermissions', { params });
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
