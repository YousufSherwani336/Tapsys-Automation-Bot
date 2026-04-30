import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export async function updateIssue(
  client: JiraClient,
  key: string,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    await client.http.put(`/issue/${encodeURIComponent(key)}`, { fields });
  } catch (err) {
    throw normalizeError(err);
  }
}
