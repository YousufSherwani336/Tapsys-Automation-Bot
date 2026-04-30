import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';
import type { JiraUser } from './searchUsers.js';

export async function getCurrentUser(client: JiraClient): Promise<JiraUser> {
  try {
    const response = await client.http.get<JiraUser>('/myself');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
