import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface AddedComment {
  id: string;
  self: string;
  body: unknown;
}

export async function addComment(
  client: JiraClient,
  key: string,
  body: string,
): Promise<AddedComment> {
  try {
    // Jira API v2 uses plain strings for comment bodies, NOT Atlassian Document Format.
    const response = await client.http.post<AddedComment>(
      `/issue/${encodeURIComponent(key)}/comment`,
      { body: body },
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
