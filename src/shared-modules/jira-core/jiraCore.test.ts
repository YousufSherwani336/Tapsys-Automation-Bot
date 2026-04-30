import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createJiraClient } from './client.js';
import { JiraError, normalizeError } from './errors.js';
import { createIssue } from './operations/createIssue.js';
import { searchIssues } from './operations/searchIssues.js';
import { JIRA_TOOL_BUILDERS } from './toolBuilders.js';

const HOST = 'test.atlassian.net';
const BASE_URL = `https://${HOST}`;

function makeClient() {
  return createJiraClient({ host: HOST, email: 'test@example.com', token: 'secret' });
}

beforeEach(() => {
  nock.cleanAll();
});

afterEach(() => {
  nock.cleanAll();
});

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------
describe('createIssue', () => {
  it('posts to /rest/api/2/issue with the expected payload', async () => {
    const client = makeClient();
    const responseBody = { id: '10001', key: 'EX-1', self: `${BASE_URL}/rest/api/2/issue/10001` };

    const scope = nock(BASE_URL)
      .post('/rest/api/2/issue', (body: Record<string, unknown>) => {
        const fields = body['fields'] as Record<string, unknown>;
        return (
          (fields['project'] as { key: string })['key'] === 'EX' &&
          fields['summary'] === 'Test issue' &&
          (fields['issuetype'] as { name: string })['name'] === 'Task'
        );
      })
      .reply(201, responseBody);

    const result = await createIssue(client, {
      project: 'EX',
      summary: 'Test issue',
      issueType: 'Task',
    });

    expect(result.key).toBe('EX-1');
    expect(result.id).toBe('10001');
    expect(scope.isDone()).toBe(true);
  });

  it('includes optional fields when provided', async () => {
    const client = makeClient();
    const responseBody = { id: '10002', key: 'EX-2', self: `${BASE_URL}/rest/api/2/issue/10002` };

    const scope = nock(BASE_URL)
      .post('/rest/api/2/issue', (body: Record<string, unknown>) => {
        const fields = body['fields'] as Record<string, unknown>;
        return (
          fields['labels'] !== undefined &&
          (fields['priority'] as { name: string })['name'] === 'High'
        );
      })
      .reply(201, responseBody);

    const result = await createIssue(client, {
      project: 'EX',
      summary: 'Issue with labels',
      issueType: 'Bug',
      priority: 'High',
      labels: ['frontend'],
    });

    expect(result.key).toBe('EX-2');
    expect(scope.isDone()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchIssues
// ---------------------------------------------------------------------------
describe('searchIssues', () => {
  it('posts JQL and returns the parsed issues array', async () => {
    const client = makeClient();
    const responseBody = {
      total: 1,
      issues: [
        { id: '10001', key: 'EX-1', self: `${BASE_URL}/rest/api/2/issue/10001`, fields: {} },
      ],
    };

    const scope = nock(BASE_URL)
      .post('/rest/api/2/search', (body: Record<string, unknown>) => body['jql'] === 'project=EX')
      .reply(200, responseBody);

    const result = await searchIssues(client, 'project=EX');

    expect(result.total).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.key).toBe('EX-1');
    expect(scope.isDone()).toBe(true);
  });

  it('passes optional fields and maxResults', async () => {
    const client = makeClient();

    const scope = nock(BASE_URL)
      .post('/rest/api/2/search', (body: Record<string, unknown>) =>
        body['maxResults'] === 5 &&
        Array.isArray(body['fields'])
      )
      .reply(200, { total: 0, issues: [] });

    const result = await searchIssues(client, 'project=EX', { fields: ['summary'], maxResults: 5 });

    expect(result.issues).toHaveLength(0);
    expect(scope.isDone()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------
describe('normalizeError', () => {
  it('maps 401 → JiraError with code auth', async () => {
    const client = makeClient();

    nock(BASE_URL).get('/rest/api/2/issue/EX-1').reply(401, { message: 'Unauthorized' });

    await expect(
      client.http.get('/issue/EX-1'),
    ).rejects.toSatisfy((err: unknown) => {
      const jiraErr = normalizeError(err);
      return jiraErr instanceof JiraError && jiraErr.code === 'auth' && jiraErr.status === 401;
    });
  });

  it('maps 404 → JiraError with code not_found', async () => {
    const client = makeClient();

    nock(BASE_URL).get('/rest/api/2/issue/EX-999').reply(404, { message: 'Not Found' });

    await expect(
      client.http.get('/issue/EX-999'),
    ).rejects.toSatisfy((err: unknown) => {
      const jiraErr = normalizeError(err);
      return jiraErr instanceof JiraError && jiraErr.code === 'not_found' && jiraErr.status === 404;
    });
  });

  it('maps 429 → JiraError with code rate_limit', async () => {
    const client = makeClient();

    nock(BASE_URL).get('/rest/api/2/issue/EX-1').reply(429, { message: 'Too Many Requests' });

    await expect(
      client.http.get('/issue/EX-1'),
    ).rejects.toSatisfy((err: unknown) => {
      const jiraErr = normalizeError(err);
      return jiraErr instanceof JiraError && jiraErr.code === 'rate_limit' && jiraErr.status === 429;
    });
  });
});

// ---------------------------------------------------------------------------
// JIRA_TOOL_BUILDERS
// ---------------------------------------------------------------------------
describe('JIRA_TOOL_BUILDERS', () => {
  it("jira.create_issue builder produces a ToolDefinition", () => {
    const client = makeClient();
    const tool = JIRA_TOOL_BUILDERS['jira.create_issue']!({
      client,
      defaults: { defaultProject: 'EX', defaultIssueType: 'Task' },
      vocabulary: { aliases: { issueTypes: { bug: 'Bug' } } },
    });

    expect(tool.name).toBe('jira.create_issue');
    expect(typeof tool.handler).toBe('function');
    expect(tool.inputSchema).toBeDefined();
  });

  it('translates vocabulary aliases and applies defaults', async () => {
    const client = makeClient();
    const tool = JIRA_TOOL_BUILDERS['jira.create_issue']!({
      client,
      defaults: { defaultProject: 'EX', defaultIssueType: 'Task' },
      vocabulary: { aliases: { issueTypes: { bug: 'Bug' } } },
    });

    const responseBody = { id: '10001', key: 'EX-1', self: `${BASE_URL}/rest/api/2/issue/10001` };
    const scope = nock(BASE_URL)
      .post('/rest/api/2/issue', (body: Record<string, unknown>) => {
        const fields = body['fields'] as Record<string, unknown>;
        // issueType alias 'bug' → 'Bug', project defaults to 'EX'
        return (
          (fields['project'] as { key: string })['key'] === 'EX' &&
          (fields['issuetype'] as { name: string })['name'] === 'Bug'
        );
      })
      .reply(201, responseBody);

    const result = await tool.handler({ summary: 'x', issueType: 'bug' });

    expect((result as { key: string }).key).toBe('EX-1');
    expect(scope.isDone()).toBe(true);
  });

  it('handler validates input via inputSchema and rejects junk', async () => {
    const client = makeClient();
    const tool = JIRA_TOOL_BUILDERS['jira.create_issue']!({
      client,
      defaults: {},
      vocabulary: {},
    });

    // summary is required; passing a number should fail zod parse
    const parseResult = tool.inputSchema.safeParse({ summary: 42 });
    expect(parseResult.success).toBe(false);
  });

  it('handler rejects when required defaults are missing', async () => {
    const client = makeClient();
    const tool = JIRA_TOOL_BUILDERS['jira.create_issue']!({
      client,
      defaults: {}, // no defaultProject
      vocabulary: {},
    });

    await expect(
      tool.handler({ summary: 'test', issueType: 'Task' }),
    ).rejects.toThrow('project is required');
  });
});
