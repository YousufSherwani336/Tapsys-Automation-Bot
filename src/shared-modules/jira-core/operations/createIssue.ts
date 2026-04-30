import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface CreateIssueInput {
  project: string;
  summary: string;
  issueType: string;
  priority?: string;
  description?: string;
  assignee?: string;
  labels?: string[];
}

export interface CreatedIssue {
  id: string;
  key: string;
  self: string;
}

export async function createIssue(
  client: JiraClient,
  input: CreateIssueInput,
): Promise<CreatedIssue> {
  try {
    // Build ADF description if provided
    const fields: Record<string, unknown> = {
      project: { key: input.project },
      summary: input.summary,
      issuetype: { name: input.issueType },
    };

    if (input.priority) {
      fields['priority'] = { name: input.priority };
    }
    if (input.description) {
      // Jira API v2 uses plain strings for description.
      fields['description'] = input.description;
    }
    if (input.assignee) {
      // Jira API v2 (Server/Data Center) uses 'name' instead of 'accountId'
      fields['assignee'] = { name: input.assignee };
    }
    if (input.labels && input.labels.length > 0) {
      fields['labels'] = input.labels;
    }

    const response = await client.http.post<CreatedIssue>('/issue', { fields });
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
