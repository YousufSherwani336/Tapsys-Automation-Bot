import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export async function transitionIssue(
  client: JiraClient,
  key: string,
  transitionId: string,
): Promise<void> {
  try {
    await client.http.post(`/issue/${encodeURIComponent(key)}/transitions`, {
      transition: { id: transitionId },
    });
  } catch (err) {
    throw normalizeError(err);
  }
}
