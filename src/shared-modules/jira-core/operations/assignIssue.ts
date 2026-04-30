import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export async function assignIssue(
  client: JiraClient,
  key: string,
  username: string,
): Promise<void> {
  try {
    // Jira API v2 (Server/Data Center) uses 'name' for assignee
    await client.http.put(`/issue/${encodeURIComponent(key)}/assignee`, {
      name: username,
    });
  } catch (err) {
    throw normalizeError(err);
  }
}
