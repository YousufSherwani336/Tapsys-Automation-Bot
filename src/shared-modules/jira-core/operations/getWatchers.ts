import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface WatchersResult {
  self: string;
  isWatching: boolean;
  watchCount: number;
  watchers: Array<{ self: string; name: string; displayName: string; active: boolean }>;
}

export async function getWatchers(
  client: JiraClient,
  key: string,
): Promise<WatchersResult> {
  try {
    const response = await client.http.get<WatchersResult>(
      `/issue/${encodeURIComponent(key)}/watchers`,
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
