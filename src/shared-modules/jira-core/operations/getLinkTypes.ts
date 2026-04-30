import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface IssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export interface GetLinkTypesResult {
  issueLinkTypes: IssueLinkType[];
}

export async function getLinkTypes(client: JiraClient): Promise<GetLinkTypesResult> {
  try {
    const response = await client.http.get<GetLinkTypesResult>('/issueLinkType');
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
