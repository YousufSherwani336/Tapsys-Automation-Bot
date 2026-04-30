import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

export interface ListTransitionsResult {
  transitions: JiraTransition[];
}

export async function listTransitions(
  client: JiraClient,
  key: string,
): Promise<ListTransitionsResult> {
  try {
    const response = await client.http.get<ListTransitionsResult>(
      `/issue/${encodeURIComponent(key)}/transitions`,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
