import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';
import type { JiraUser } from './searchUsers.js';

export interface FindAssignableUsersOptions {
  project?: string;
  issueKey?: string;
  username?: string;
  maxResults?: number;
  startAt?: number;
}

export async function findAssignableUsers(
  client: JiraClient,
  opts: FindAssignableUsersOptions = {},
): Promise<JiraUser[]> {
  try {
    const params: Record<string, unknown> = {};
    if (opts.project) params['project'] = opts.project;
    if (opts.issueKey) params['issueKey'] = opts.issueKey;
    if (opts.username) params['username'] = opts.username;
    if (opts.maxResults !== undefined) params['maxResults'] = opts.maxResults;
    if (opts.startAt !== undefined) params['startAt'] = opts.startAt;

    const response = await client.http.get<JiraUser[]>('/user/assignable/search', { params });
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
