import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface ServerInfo {
  baseUrl: string;
  version: string;
  versionNumbers: number[];
  buildNumber: number;
  buildDate: string;
  serverTime: string;
  serverTitle: string;
}

export async function getServerInfo(client: JiraClient): Promise<ServerInfo> {
  try {
    const response = await client.http.get<ServerInfo>('/serverInfo');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
