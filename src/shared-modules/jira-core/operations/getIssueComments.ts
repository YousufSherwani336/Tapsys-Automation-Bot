import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface IssueComment {
  id: string;
  self: string;
  body: string;
  author: { name: string; displayName: string; emailAddress?: string };
  created: string;
  updated: string;
}

export interface GetIssueCommentsResult {
  startAt: number;
  maxResults: number;
  total: number;
  comments: IssueComment[];
}

export interface GetIssueCommentsOptions {
  startAt?: number;
  maxResults?: number;
  orderBy?: string;
}

export async function getIssueComments(
  client: JiraClient,
  key: string,
  opts: GetIssueCommentsOptions = {},
): Promise<GetIssueCommentsResult> {
  try {
    const params: Record<string, unknown> = {};
    if (opts.startAt !== undefined) params['startAt'] = opts.startAt;
    if (opts.maxResults !== undefined) params['maxResults'] = opts.maxResults;
    if (opts.orderBy) params['orderBy'] = opts.orderBy;

    const response = await client.http.get<GetIssueCommentsResult>(
      `/issue/${encodeURIComponent(key)}/comment`,
      { params },
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
