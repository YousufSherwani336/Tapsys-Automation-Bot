import FormData from 'form-data';
import type { JiraClient } from '../client.js';
import { normalizeError } from '../errors.js';

export interface AttachFileInput {
  filename: string;
  buffer: Buffer;
  contentType: string;
}

export interface AttachedFile {
  id: string;
  filename: string;
  self: string;
}

export async function attachFile(
  client: JiraClient,
  key: string,
  input: AttachFileInput,
): Promise<AttachedFile[]> {
  try {
    const form = new FormData();
    form.append('file', input.buffer, {
      filename: input.filename,
      contentType: input.contentType,
    });

    const response = await client.http.post<AttachedFile[]>(
      `/issue/${encodeURIComponent(key)}/attachments`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          // Required by Jira to accept attachment uploads
          'X-Atlassian-Token': 'no-check',
        },
      },
    );
    return response.data;
  } catch (err) {
    throw normalizeError(err);
  }
}
