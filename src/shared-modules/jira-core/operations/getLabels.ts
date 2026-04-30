import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface JiraLabelResult {
  label: string;
}

export interface GetLabelsResult {
  values: string[];
  total: number;
}

export async function getLabels(
  client: JiraClient,
  maxResults?: number,
): Promise<GetLabelsResult> {
  try {
    const params: Record<string, unknown> = {};
    if (maxResults !== undefined) params['maxResults'] = maxResults;

    const response = await client.http.get<GetLabelsResult>('/label', { params });
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
