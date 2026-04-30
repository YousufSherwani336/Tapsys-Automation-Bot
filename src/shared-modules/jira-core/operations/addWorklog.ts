import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface AddWorklogInput {
  timeSpent: string;
  comment?: string;
  started?: string;
}

export interface WorklogEntry {
  id: string;
  self: string;
  author: { name: string; displayName: string };
  timeSpent: string;
  timeSpentSeconds: number;
  comment?: string;
  started: string;
  created: string;
  updated: string;
}

export async function addWorklog(
  client: JiraClient,
  key: string,
  input: AddWorklogInput,
): Promise<WorklogEntry> {
  try {
    const body: Record<string, unknown> = {
      timeSpent: input.timeSpent,
    };
    if (input.comment) body['comment'] = input.comment;
    if (input.started) body['started'] = input.started;

    const response = await client.http.post<WorklogEntry>(
      `/issue/${encodeURIComponent(key)}/worklog`,
      body,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
