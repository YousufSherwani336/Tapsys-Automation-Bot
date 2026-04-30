import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface LinkIssuesInput {
  type: string;
  inwardIssueKey: string;
  outwardIssueKey: string;
  comment?: string;
}

export async function linkIssues(
  client: JiraClient,
  input: LinkIssuesInput,
): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      type: { name: input.type },
      inwardIssue: { key: input.inwardIssueKey },
      outwardIssue: { key: input.outwardIssueKey },
    };
    if (input.comment) {
      body['comment'] = { body: input.comment };
    }

    await client.http.post('/issueLink', body);
  } catch (err) {
    throw normalizeError(err);
  }
}
