import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';
import type { JiraUser } from './searchUsers.js';

export async function getUser(
  client: JiraClient,
  username: string,
): Promise<JiraUser> {
  try {
    const response = await client.http.get<JiraUser>('/user', {
      params: { username },
    });
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
