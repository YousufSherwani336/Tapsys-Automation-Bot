import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';
import type { WorklogEntry } from './addWorklog.js';

export interface GetWorklogsResult {
  startAt: number;
  maxResults: number;
  total: number;
  worklogs: WorklogEntry[];
}

export async function getWorklogs(
  client: JiraClient,
  key: string,
): Promise<GetWorklogsResult> {
  try {
    const response = await client.http.get<GetWorklogsResult>(
      `/issue/${encodeURIComponent(key)}/worklog`,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
