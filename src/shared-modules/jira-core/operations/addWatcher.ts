import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export async function addWatcher(
  client: JiraClient,
  key: string,
  username: string,
): Promise<void> {
  try {
    // Jira API v2 expects the username as a JSON string in the request body
    await client.http.post(
      `/issue/${encodeURIComponent(key)}/watchers`,
      JSON.stringify(username),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    throw normalizeError(err);
  }
}
