import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraUser {
  self: string;
  key: string;
  name: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
}

export interface SearchUsersOptions {
  maxResults?: number;
  startAt?: number;
}

export async function searchUsers(
  client: JiraClient,
  query: string,
  opts: SearchUsersOptions = {},
): Promise<JiraUser[]> {
  try {
    const params: Record<string, unknown> = { username: query };
    if (opts.maxResults !== undefined) params['maxResults'] = opts.maxResults;
    if (opts.startAt !== undefined) params['startAt'] = opts.startAt;

    const response = await client.http.get<JiraUser[]>('/user/search', { params });
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
